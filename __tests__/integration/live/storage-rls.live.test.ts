/**
 * REAL Supabase Storage RLS integration tests for the `avatars` bucket.
 *
 * Runs against an actual local Supabase stack (see live-supabase-helpers.ts
 * for how to enable). Nothing here is mocked — every assertion is a live
 * HTTP call to Postgres/Storage, evaluated by the real RLS policies in
 * `supabase/migrations/0003_user_profiles.sql`.
 *
 * This suite specifically covers the regression that shipped in the
 * original Phase 2 branch: `avatars_update_own` did not exist, so
 * replacing an avatar (upsert onto an existing object → Storage performs
 * an UPDATE, not an INSERT) was denied by RLS for every user, including
 * the object's own owner. See "same-owner replace" below.
 */
// Only imported here for its `avatarStoragePath`/`SIGNED_URL_EXPIRY_SECONDS`
// constants (to stay coupled to the real path convention) — mock the logger
// so importing that module doesn't spin up Pino's pretty-print worker
// thread, which otherwise leaks an open handle in the Jest process.
jest.mock("@/lib/server/shared/logger", () => ({
  childLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  describeLive,
  assertReachable,
  createLiveTestUser,
  cleanupLiveTestUser,
  seedProfile,
  type LiveConfig,
} from "./live-supabase-helpers";
import { avatarStoragePath, SIGNED_URL_EXPIRY_SECONDS } from "@/lib/server/profile/avatar.service";

describeLive("Storage RLS — avatars bucket (live)", (config: LiveConfig) => {
  let userAId: string;
  let userBId: string;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  beforeAll(async () => {
    await assertReachable(config);

    const a = await createLiveTestUser(config, "storage-a");
    const b = await createLiveTestUser(config, "storage-b");
    userAId = a.userId;
    userBId = b.userId;
    clientA = a.client;
    clientB = b.client;

    await seedProfile(a.admin, a.userId, "Storage Test A");
    await seedProfile(b.admin, b.userId, "Storage Test B");
  }, 30000);

  afterAll(async () => {
    if (userAId) await cleanupLiveTestUser(config, userAId);
    if (userBId) await cleanupLiveTestUser(config, userBId);
  }, 30000);

  const pathA = () => avatarStoragePath(userAId);

  it("User A can upload a first-time avatar to their own path", async () => {
    const { error } = await clientA.storage
      .from("avatars")
      .upload(pathA(), new TextEncoder().encode("AVATAR-V1"), { contentType: "image/png", upsert: true });

    expect(error).toBeNull();
  });

  it("REGRESSION: User A can replace (upsert onto the same existing path) their own avatar", async () => {
    // Precondition: an avatar already exists at this path from the previous test.
    const { error } = await clientA.storage
      .from("avatars")
      .upload(pathA(), new TextEncoder().encode("AVATAR-V2-REPLACED"), { contentType: "image/webp", upsert: true });

    // This is the exact operation that previously failed with:
    // "new row violates row-level security policy" (403) because no
    // avatars_update_own policy existed.
    expect(error).toBeNull();
  });

  it("the replacement actually took effect — downloaded content is the NEW bytes, not the old ones", async () => {
    const { data: signed, error: signError } = await clientA.storage
      .from("avatars")
      .createSignedUrl(pathA(), SIGNED_URL_EXPIRY_SECONDS);
    expect(signError).toBeNull();
    expect(signed?.signedUrl).toBeTruthy();

    const res = await fetch(signed!.signedUrl);
    const text = await res.text();
    expect(text).toBe("AVATAR-V2-REPLACED");
  });

  it("exactly one object exists at the path after a replace (no orphaned duplicates, nothing deleted)", async () => {
    const { data: listing, error } = await clientA.storage
      .from("avatars")
      .list(`user/${userAId}`, { search: "avatar" });

    expect(error).toBeNull();
    expect(listing).toHaveLength(1);
  });

  it("User A can generate a signed URL for their own avatar", async () => {
    const { data, error } = await clientA.storage.from("avatars").createSignedUrl(pathA(), SIGNED_URL_EXPIRY_SECONDS);
    expect(error).toBeNull();
    expect(data?.signedUrl).toContain("avatars");
  });

  it("User B cannot upload to User A's path (INSERT case: no object yet)", async () => {
    // Use a throwaway path under A's prefix that doesn't exist yet, to isolate the INSERT policy.
    const { error } = await clientB.storage
      .from("avatars")
      .upload(`user/${userAId}/avatar-b-attempt`, new TextEncoder().encode("HACK"), {
        contentType: "image/png",
      });

    expect(error).not.toBeNull();
  });

  it("User B cannot overwrite User A's EXISTING avatar (UPDATE case, the same operation the regression test above proved works for the owner)", async () => {
    const { error } = await clientB.storage
      .from("avatars")
      .upload(pathA(), new TextEncoder().encode("HACKED-BY-B"), { contentType: "image/png", upsert: true });

    expect(error).not.toBeNull();
  });

  it("User B cannot read/download User A's avatar directly", async () => {
    const { error } = await clientB.storage.from("avatars").download(pathA());
    expect(error).not.toBeNull();
  });

  it("User B cannot generate a signed URL for User A's avatar", async () => {
    const { data, error } = await clientB.storage.from("avatars").createSignedUrl(pathA(), SIGNED_URL_EXPIRY_SECONDS);
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("User B cannot delete User A's avatar", async () => {
    await clientB.storage.from("avatars").remove([pathA()]);

    // Ground truth: confirm as A that the object is still there and unchanged.
    const { data: signed } = await clientA.storage.from("avatars").createSignedUrl(pathA(), SIGNED_URL_EXPIRY_SECONDS);
    const res = await fetch(signed!.signedUrl);
    expect(res.ok).toBe(true);
    const text = await res.text();
    expect(text).toBe("AVATAR-V2-REPLACED");
  });

  it("cross-user denial masks object existence (403/404-shaped errors, not a leak of 'exists but forbidden')", async () => {
    const { error: readErr } = await clientB.storage.from("avatars").download(pathA());
    const { error: signErr } = await clientB.storage.from("avatars").createSignedUrl(pathA(), 60);

    // Both must be errors; neither exposes success or object metadata to a non-owner.
    expect(readErr).not.toBeNull();
    expect(signErr).not.toBeNull();
  });

  it("User A can delete their own avatar", async () => {
    const { error } = await clientA.storage.from("avatars").remove([pathA()]);
    expect(error).toBeNull();

    const { data: listing } = await clientA.storage.from("avatars").list(`user/${userAId}`, { search: "avatar" });
    expect(listing).toHaveLength(0);
  });
});
