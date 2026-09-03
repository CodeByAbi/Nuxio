/**
 * Unit tests for avatar.service — validation logic and upload flow.
 *
 * These tests exercise the pure validation path without hitting Supabase,
 * so the Supabase client and all server modules are mocked. Real Storage
 * RLS behavior (the thing that actually broke avatar replacement) is
 * covered separately by `__tests__/integration/storage-rls.live.test.ts`
 * against a real local Supabase stack — mocks cannot verify RLS.
 */

// ── Module mocks (must be hoisted before imports) ─────────────────────────────
jest.mock("@/lib/server/shared/logger", () => ({
  childLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock("@/lib/server/shared/supabase-server-client", () => ({
  createSupabaseServerClient: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import { uploadAvatar, resolveAvatarUrl, avatarStoragePath } from "@/lib/server/profile/avatar.service";
import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import { ValidationError } from "@/lib/server/shared/errors";

const mockedCreateClient = createSupabaseServerClient as jest.Mock;

/** Build a minimal File-like object. `File` is available in Node 20+. */
function makeFile(sizeBytes: number, mimeType: string, name = "test"): File {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type: mimeType });
}

/**
 * Configure the Supabase mock so the full upload flow succeeds:
 *  - upload() with upsert          → succeeds
 *  - user_profiles.update()        → persists the stable path
 *  - createSignedUrl()             → returns a signed URL for the response
 */
function mockSuccessfulUpload() {
  const uploadMock = jest.fn().mockResolvedValue({ data: {}, error: null });
  const removeMock = jest.fn().mockResolvedValue({ data: {}, error: null });
  const createSignedUrlMock = jest.fn().mockResolvedValue({
    data: { signedUrl: "https://signed.example.com/avatar" },
    error: null,
  });
  const eqMock = jest.fn().mockResolvedValue({ error: null });
  const updateMock = jest.fn(() => ({ eq: eqMock }));

  mockedCreateClient.mockResolvedValue({
    storage: {
      from: () => ({
        upload: uploadMock,
        remove: removeMock,
        createSignedUrl: createSignedUrlMock,
      }),
    },
    from: () => ({ update: updateMock }),
  });

  return { uploadMock, removeMock, createSignedUrlMock, updateMock, eqMock };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("avatar.service — file validation", () => {
  const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── MIME type rejection ───────────────────────────────────────────────────

  it("rejects a PDF file (MIME not in whitelist)", async () => {
    const pdfFile = makeFile(10_000, "application/pdf", "invoice.pdf");

    await expect(uploadAvatar(FAKE_USER_ID, pdfFile)).rejects.toMatchObject({
      name: "ValidationError",
      statusCode: 400,
    });
  });

  it("rejects an EXE file (MIME not in whitelist)", async () => {
    const exeFile = makeFile(10_000, "application/octet-stream", "malware.exe");

    await expect(uploadAvatar(FAKE_USER_ID, exeFile)).rejects.toMatchObject({
      name: "ValidationError",
      statusCode: 400,
    });
  });

  it("rejects a file with an empty MIME type", async () => {
    const unknownFile = makeFile(10_000, "", "no-type");

    await expect(uploadAvatar(FAKE_USER_ID, unknownFile)).rejects.toBeInstanceOf(ValidationError);
  });

  // ── Size rejection ────────────────────────────────────────────────────────

  it("rejects a 3 MB PNG file (exceeds 2 MB limit)", async () => {
    const threeMb = makeFile(3 * 1024 * 1024, "image/png", "large.png");

    await expect(uploadAvatar(FAKE_USER_ID, threeMb)).rejects.toMatchObject({
      name: "ValidationError",
      statusCode: 400,
    });
  });

  it("rejects a file exactly at 2 MB + 1 byte", async () => {
    const over = makeFile(2 * 1024 * 1024 + 1, "image/jpeg", "over.jpg");

    await expect(uploadAvatar(FAKE_USER_ID, over)).rejects.toBeInstanceOf(ValidationError);
  });

  // ── Acceptance ────────────────────────────────────────────────────────────

  it("accepts a 500 KB PNG file", async () => {
    mockSuccessfulUpload();
    const smallPng = makeFile(500 * 1024, "image/png", "avatar.png");

    const result = await uploadAvatar(FAKE_USER_ID, smallPng);
    expect(typeof result).toBe("string");
    expect(result).toContain("signed.example.com");
  });

  it("accepts a JPEG file at exactly 2 MB", async () => {
    mockSuccessfulUpload();
    const exactly2Mb = makeFile(2 * 1024 * 1024, "image/jpeg", "exact.jpg");

    await expect(uploadAvatar(FAKE_USER_ID, exactly2Mb)).resolves.toBeTruthy();
  });

  it("accepts a WebP file", async () => {
    mockSuccessfulUpload();
    const webp = makeFile(100_000, "image/webp", "avatar.webp");

    await expect(uploadAvatar(FAKE_USER_ID, webp)).resolves.toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("avatar.service — upload flow", () => {
  const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uploads with upsert:true to the deterministic path", async () => {
    const { uploadMock } = mockSuccessfulUpload();
    const file = makeFile(100_000, "image/png", "avatar.png");

    await uploadAvatar(FAKE_USER_ID, file);

    expect(uploadMock).toHaveBeenCalledWith(
      avatarStoragePath(FAKE_USER_ID),
      expect.anything(),
      expect.objectContaining({ upsert: true }),
    );
  });

  it("persists the STABLE PATH (not a signed URL) to user_profiles.avatar_url", async () => {
    const { updateMock, eqMock } = mockSuccessfulUpload();
    const file = makeFile(100_000, "image/png", "avatar.png");

    await uploadAvatar(FAKE_USER_ID, file);

    expect(updateMock).toHaveBeenCalledWith({ avatar_url: avatarStoragePath(FAKE_USER_ID) });
    expect(eqMock).toHaveBeenCalledWith("id", FAKE_USER_ID);
  });

  it("regression guard: does NOT call remove() after upload (that previously deleted the just-uploaded file, since old and new share one deterministic path)", async () => {
    const { removeMock } = mockSuccessfulUpload();
    const file = makeFile(100_000, "image/png", "avatar.png");

    await uploadAvatar(FAKE_USER_ID, file);

    expect(removeMock).not.toHaveBeenCalled();
  });

  it("returns a freshly signed URL on success", async () => {
    mockSuccessfulUpload();
    const file = makeFile(200_000, "image/jpeg", "photo.jpg");

    const result = await uploadAvatar(FAKE_USER_ID, file);
    expect(result).toBe("https://signed.example.com/avatar");
  });

  it("throws InternalError when the storage upload itself fails", async () => {
    mockedCreateClient.mockResolvedValue({
      storage: {
        from: () => ({
          upload: jest.fn().mockResolvedValue({ data: null, error: { message: "storage down" } }),
        }),
      },
      from: () => ({ update: jest.fn() }),
    });
    const file = makeFile(100_000, "image/png", "avatar.png");

    await expect(uploadAvatar(FAKE_USER_ID, file)).rejects.toMatchObject({ name: "InternalError" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("avatar.service — resolveAvatarUrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null immediately for a null path, without touching Storage", async () => {
    const createSignedUrlMock = jest.fn();
    const supabase = { storage: { from: () => ({ createSignedUrl: createSignedUrlMock }) } } as never;

    const result = await resolveAvatarUrl(supabase, null);

    expect(result).toBeNull();
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("returns a fresh signed URL for a stored path", async () => {
    const createSignedUrlMock = jest.fn().mockResolvedValue({
      data: { signedUrl: "https://signed.example.com/fresh" },
      error: null,
    });
    const supabase = { storage: { from: () => ({ createSignedUrl: createSignedUrlMock }) } } as never;

    const result = await resolveAvatarUrl(supabase, "user/abc/avatar");

    expect(result).toBe("https://signed.example.com/fresh");
    expect(createSignedUrlMock).toHaveBeenCalledWith("user/abc/avatar", 60 * 60);
  });

  it("returns null (not a throw) when signing fails — e.g. the object was removed out-of-band", async () => {
    const createSignedUrlMock = jest.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
    const supabase = { storage: { from: () => ({ createSignedUrl: createSignedUrlMock }) } } as never;

    const result = await resolveAvatarUrl(supabase, "user/abc/avatar");

    expect(result).toBeNull();
  });
});
