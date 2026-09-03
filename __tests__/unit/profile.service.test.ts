/**
 * Unit tests for profile.service — specifically that avatar_url is resolved
 * from a stable Storage path into a fresh signed URL on every read, and that
 * a profile with no avatar returns `avatar_url: null` without touching
 * Storage at all.
 */

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

import { getProfile, updateProfile } from "@/lib/server/profile/profile.service";
import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";

const mockedCreateClient = createSupabaseServerClient as jest.Mock;

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";

describe("profile.service — getProfile avatar resolution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns avatar_url: null and never calls Storage when no avatar path is stored", async () => {
    const createSignedUrlMock = jest.fn();
    mockedCreateClient.mockResolvedValue({
      storage: { from: () => ({ createSignedUrl: createSignedUrlMock }) },
      from: () => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: { id: FAKE_USER_ID, display_name: "Alice", avatar_url: null }, error: null }),
      }),
    });

    const profile = await getProfile(FAKE_USER_ID);

    expect(profile.avatar_url).toBeNull();
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });

  it("resolves a stored path into a fresh signed URL, not the raw DB value", async () => {
    const createSignedUrlMock = jest.fn().mockResolvedValue({
      data: { signedUrl: "https://signed.example.com/fresh-token-abc" },
      error: null,
    });
    mockedCreateClient.mockResolvedValue({
      storage: { from: () => ({ createSignedUrl: createSignedUrlMock }) },
      from: () => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: FAKE_USER_ID, display_name: "Alice", avatar_url: `user/${FAKE_USER_ID}/avatar` },
          error: null,
        }),
      }),
    });

    const profile = await getProfile(FAKE_USER_ID);

    expect(profile.avatar_url).toBe("https://signed.example.com/fresh-token-abc");
    expect(createSignedUrlMock).toHaveBeenCalledWith(`user/${FAKE_USER_ID}/avatar`, 60 * 60);
  });

  it("simulates URL expiry across two calls: the DB value never changes, but the returned URL does", async () => {
    let signCount = 0;
    const createSignedUrlMock = jest.fn().mockImplementation(() => {
      signCount += 1;
      return Promise.resolve({ data: { signedUrl: `https://signed.example.com/token-${signCount}` }, error: null });
    });
    const storedPath = `user/${FAKE_USER_ID}/avatar`;
    mockedCreateClient.mockResolvedValue({
      storage: { from: () => ({ createSignedUrl: createSignedUrlMock }) },
      from: () => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest
          .fn()
          .mockResolvedValue({ data: { id: FAKE_USER_ID, display_name: "Alice", avatar_url: storedPath }, error: null }),
      }),
    });

    const first = await getProfile(FAKE_USER_ID);
    const second = await getProfile(FAKE_USER_ID);

    // Two independent reads produce two independently-signed URLs (proving no
    // stale/cached signed URL is ever reused), while both resolve from the
    // same stable stored path.
    expect(first.avatar_url).toBe("https://signed.example.com/token-1");
    expect(second.avatar_url).toBe("https://signed.example.com/token-2");
    expect(createSignedUrlMock).toHaveBeenCalledTimes(2);
  });
});

describe("profile.service — updateProfile avatar resolution", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves avatar_url the same way as getProfile in the PATCH response", async () => {
    const createSignedUrlMock = jest.fn().mockResolvedValue({
      data: { signedUrl: "https://signed.example.com/patch-response" },
      error: null,
    });
    const storedPath = `user/${FAKE_USER_ID}/avatar`;
    mockedCreateClient.mockResolvedValue({
      storage: { from: () => ({ createSignedUrl: createSignedUrlMock }) },
      from: () => ({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: FAKE_USER_ID,
            display_name: "New Name",
            avatar_url: storedPath,
            updated_at: "2026-01-01T00:00:00.000Z",
          },
          error: null,
        }),
      }),
    });

    const result = await updateProfile(FAKE_USER_ID, { display_name: "New Name" });

    expect(result.avatar_url).toBe("https://signed.example.com/patch-response");
    expect(result.display_name).toBe("New Name");
  });
});
