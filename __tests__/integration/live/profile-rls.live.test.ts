/**
 * REAL PostgreSQL RLS integration tests for `public.user_profiles`.
 *
 * Runs against an actual local Supabase stack (see live-supabase-helpers.ts
 * for how to enable). Nothing here is mocked.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  describeLive,
  assertReachable,
  createLiveTestUser,
  cleanupLiveTestUser,
  seedProfile,
  type LiveConfig,
} from "./live-supabase-helpers";

describeLive("Postgres RLS — user_profiles (live)", (config: LiveConfig) => {
  let userAId: string;
  let userBId: string;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  beforeAll(async () => {
    await assertReachable(config);

    const a = await createLiveTestUser(config, "profile-a");
    const b = await createLiveTestUser(config, "profile-b");
    userAId = a.userId;
    userBId = b.userId;
    clientA = a.client;
    clientB = b.client;

    await seedProfile(a.admin, a.userId, "Profile Test A");
    await seedProfile(b.admin, b.userId, "Profile Test B");
  }, 30000);

  afterAll(async () => {
    if (userAId) await cleanupLiveTestUser(config, userAId);
    if (userBId) await cleanupLiveTestUser(config, userBId);
  }, 30000);

  it("User A can SELECT their own profile", async () => {
    const { data, error } = await clientA.from("user_profiles").select("*").eq("id", userAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].display_name).toBe("Profile Test A");
  });

  it("User A can UPDATE their own profile", async () => {
    const { data, error } = await clientA
      .from("user_profiles")
      .update({ display_name: "Updated By Owner" })
      .eq("id", userAId)
      .select();

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].display_name).toBe("Updated By Owner");
  });

  it("User A cannot SELECT User B's profile (returns zero rows, not an error, not B's data)", async () => {
    const { data, error } = await clientA.from("user_profiles").select("*").eq("id", userBId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("User A cannot UPDATE User B's profile (zero rows affected)", async () => {
    const { data, error } = await clientA
      .from("user_profiles")
      .update({ display_name: "Hacked by A" })
      .eq("id", userBId)
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);

    // Ground truth: B's row is untouched.
    const { data: bRow } = await clientB.from("user_profiles").select("display_name").eq("id", userBId).single();
    expect(bRow?.display_name).toBe("Profile Test B");
  });

  it("no user (not even for their own id) can INSERT a new profile row — reserved for the Phase 3 trigger", async () => {
    const { error } = await clientA.from("user_profiles").insert({ id: userAId, display_name: "Should Fail" });
    expect(error).not.toBeNull();
  });

  it("no user can DELETE a profile row, including their own", async () => {
    const { error } = await clientA.from("user_profiles").delete().eq("id", userAId);
    expect(error).not.toBeNull();

    const { data: stillThere } = await clientA.from("user_profiles").select("id").eq("id", userAId);
    expect(stillThere).toHaveLength(1);
  });
});
