/**
 * Unit tests for avatar.service — validation logic and upload flow.
 *
 * These tests exercise the pure validation path without hitting Supabase,
 * so the Supabase client and all server modules are mocked.
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
import { uploadAvatar } from "@/lib/server/profile/avatar.service";
import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import { ValidationError } from "@/lib/server/shared/errors";

const mockedCreateClient = createSupabaseServerClient as jest.Mock;

/** Build a minimal File-like object. `File` is available in Node 20+. */
function makeFile(sizeBytes: number, mimeType: string, name = "test"): File {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type: mimeType });
}

/**
 * Configure the Supabase mock so the full upload flow succeeds.
 *
 * The mock covers the new steps introduced to satisfy the spec:
 *  - Step 3: list() to check for existing object  → returns one file
 *  - Step 4: upload() with upsert                 → succeeds
 *  - Step 5: remove() explicit delete             → succeeds
 *  - Step 6: createSignedUrl()                    → returns signed URL
 *  - Step 7: from("user_profiles").update()       → succeeds
 */
function mockSuccessfulUpload() {
  const uploadMock = jest.fn().mockResolvedValue({ data: {}, error: null });
  const removeMock = jest.fn().mockResolvedValue({ data: {}, error: null });
  const listMock = jest.fn().mockResolvedValue({
    data: [{ name: "avatar" }],
    error: null,
  });
  const createSignedUrlMock = jest.fn().mockResolvedValue({
    data: { signedUrl: "https://signed.example.com/avatar" },
    error: null,
  });

  mockedCreateClient.mockResolvedValue({
    storage: {
      from: () => ({
        upload: uploadMock,
        remove: removeMock,
        list: listMock,
        createSignedUrl: createSignedUrlMock,
      }),
    },
    from: () => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  });

  return { uploadMock, removeMock, listMock, createSignedUrlMock };
}

/**
 * Configure the mock for the case where no previous avatar exists.
 * list() returns an empty array → remove() should NOT be called.
 */
function mockSuccessfulUploadNoExisting() {
  const uploadMock = jest.fn().mockResolvedValue({ data: {}, error: null });
  const removeMock = jest.fn().mockResolvedValue({ data: {}, error: null });
  const listMock = jest.fn().mockResolvedValue({ data: [], error: null });
  const createSignedUrlMock = jest.fn().mockResolvedValue({
    data: { signedUrl: "https://signed.example.com/avatar" },
    error: null,
  });

  mockedCreateClient.mockResolvedValue({
    storage: {
      from: () => ({
        upload: uploadMock,
        remove: removeMock,
        list: listMock,
        createSignedUrl: createSignedUrlMock,
      }),
    },
    from: () => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  });

  return { uploadMock, removeMock, listMock };
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
      statusCode: 422,
    });
  });

  it("rejects an EXE file (MIME not in whitelist)", async () => {
    const exeFile = makeFile(10_000, "application/octet-stream", "malware.exe");

    await expect(uploadAvatar(FAKE_USER_ID, exeFile)).rejects.toMatchObject({
      name: "ValidationError",
      statusCode: 422,
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
      statusCode: 422,
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

describe("avatar.service — upload flow (step 3 & 5)", () => {
  const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls list() to check for existing avatar before uploading (step 3)", async () => {
    const { listMock } = mockSuccessfulUpload();
    const file = makeFile(100_000, "image/png", "avatar.png");

    await uploadAvatar(FAKE_USER_ID, file);

    expect(listMock).toHaveBeenCalledWith(`user/${FAKE_USER_ID}`, { search: "avatar" });
  });

  it("calls remove() to delete old avatar after successful upload when previous exists (step 5)", async () => {
    const { removeMock } = mockSuccessfulUpload(); // list returns [{name: "avatar"}]
    const file = makeFile(100_000, "image/png", "avatar.png");

    await uploadAvatar(FAKE_USER_ID, file);

    // remove() must be called with the same path
    expect(removeMock).toHaveBeenCalledWith([`user/${FAKE_USER_ID}/avatar`]);
  });

  it("does NOT call remove() when no previous avatar exists (step 5 skip)", async () => {
    const { removeMock } = mockSuccessfulUploadNoExisting(); // list returns []
    const file = makeFile(100_000, "image/png", "avatar.png");

    await uploadAvatar(FAKE_USER_ID, file);

    expect(removeMock).not.toHaveBeenCalled();
  });

  it("does NOT throw when remove() fails after successful upload (non-fatal, step 5)", async () => {
    const uploadMock = jest.fn().mockResolvedValue({ data: {}, error: null });
    const removeMock = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "storage error" },
    });
    const listMock = jest.fn().mockResolvedValue({
      data: [{ name: "avatar" }],
      error: null,
    });
    const createSignedUrlMock = jest.fn().mockResolvedValue({
      data: { signedUrl: "https://signed.example.com/avatar" },
      error: null,
    });

    mockedCreateClient.mockResolvedValue({
      storage: {
        from: () => ({
          upload: uploadMock,
          remove: removeMock,
          list: listMock,
          createSignedUrl: createSignedUrlMock,
        }),
      },
      from: () => ({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });

    const file = makeFile(100_000, "image/png", "avatar.png");

    // Should still resolve successfully even though delete failed
    await expect(uploadAvatar(FAKE_USER_ID, file)).resolves.toBe("https://signed.example.com/avatar");
  });

  it("returns the signed URL on success", async () => {
    mockSuccessfulUpload();
    const file = makeFile(200_000, "image/jpeg", "photo.jpg");

    const result = await uploadAvatar(FAKE_USER_ID, file);
    expect(result).toBe("https://signed.example.com/avatar");
  });
});
