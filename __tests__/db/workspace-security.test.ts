/**
 * Real-Supabase security tests for the `workspaces` / `workspace_members`
 * RLS policies and the invariant triggers added in migration
 * 0007_phase3_security_hardening.sql.
 *
 * Every assertion here queries through an authenticated user's OWN client
 * (anon key + their session) — the same access a raw PostgREST call would
 * have, bypassing the Next.js app entirely. The service-role client is only
 * ever used for fixture setup/cleanup, never for the assertions themselves.
 *
 * Run with: npm run test:db (requires `supabase start`, or CI's equivalent).
 */
import {
  adminClient,
  createTestUser,
  getPersonalWorkspaceId,
  deleteTestUser,
  deleteWorkspace,
  type TestUser,
} from "./helpers";

const admin = adminClient();

async function createBusinessWorkspaceAs(user: TestUser, name: string): Promise<string> {
  const { data, error } = await user.client.rpc("create_business_workspace", { p_name: name });
  if (error || !data) throw new Error(`Failed to create business workspace: ${error?.message}`);
  return data;
}

describe("Workspace isolation (RLS backstop)", () => {
  let userA: TestUser;
  let userB: TestUser;
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    userA = await createTestUser("wsiso-a");
    userB = await createTestUser("wsiso-b");
    workspaceA = await getPersonalWorkspaceId(admin, userA.id);
    workspaceB = await getPersonalWorkspaceId(admin, userB.id);
  });

  afterAll(async () => {
    await deleteTestUser(admin, userA.id);
    await deleteTestUser(admin, userB.id);
  });

  test("A cannot SELECT B's workspace by id", async () => {
    const { data, error } = await userA.client.from("workspaces").select("*").eq("id", workspaceB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("an unfiltered SELECT never returns another workspace's row (RN-02 backstop)", async () => {
    // Deliberately no .eq('id', ...) filter — this is exactly the "app forgot
    // to scope the query" scenario RLS exists to catch.
    const { data, error } = await userA.client.from("workspaces").select("*");
    expect(error).toBeNull();
    const ids = (data ?? []).map((w) => w.id);
    expect(ids).toContain(workspaceA);
    expect(ids).not.toContain(workspaceB);
  });

  test("A cannot UPDATE B's workspace", async () => {
    const { data, error } = await userA.client
      .from("workspaces")
      .update({ name: "Hijacked" })
      .eq("id", workspaceB)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]); // zero rows affected, not a leaked error message

    const { data: check } = await admin.from("workspaces").select("name").eq("id", workspaceB).single();
    expect(check?.name).not.toBe("Hijacked");
  });

  test("A cannot see B's members, even unfiltered", async () => {
    const { data, error } = await userA.client.from("workspace_members").select("*");
    expect(error).toBeNull();
    const workspaceIds = (data ?? []).map((m) => m.workspace_id);
    expect(workspaceIds).not.toContain(workspaceB);
  });

  test("A cannot modify B's membership rows", async () => {
    const { data: bMembership } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceB)
      .single();

    const { data, error } = await userA.client
      .from("workspace_members")
      .update({ role: "member" })
      .eq("id", bMembership!.id)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: check } = await admin.from("workspace_members").select("role").eq("id", bMembership!.id).single();
    expect(check?.role).toBe("admin"); // unchanged
  });

  test("A cannot delete B's membership row", async () => {
    const { data: bMembership } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceB)
      .single();

    const { error } = await userA.client.from("workspace_members").delete().eq("id", bMembership!.id);
    expect(error).toBeNull(); // RLS silently matches zero rows, not an error

    const { data: check } = await admin.from("workspace_members").select("id").eq("id", bMembership!.id).maybeSingle();
    expect(check).not.toBeNull(); // still there
  });
});

describe("Workspace type immutability (RN-05)", () => {
  let user: TestUser;
  let workspaceId: string;

  beforeAll(async () => {
    user = await createTestUser("wstype");
    workspaceId = await createBusinessWorkspaceAs(user, "Immutable Co");
  });

  afterAll(async () => {
    await deleteWorkspace(admin, workspaceId);
    await deleteTestUser(admin, user.id);
  });

  test("business -> personal is rejected at the database layer", async () => {
    const { error } = await user.client.from("workspaces").update({ type: "personal" }).eq("id", workspaceId);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("IMMUTABLE_FIELD");

    const { data: check } = await admin.from("workspaces").select("type").eq("id", workspaceId).single();
    expect(check?.type).toBe("business");
  });

  test("legitimate name updates on the same workspace still work", async () => {
    const { data, error } = await user.client
      .from("workspaces")
      .update({ name: "Renamed Co" })
      .eq("id", workspaceId)
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.name).toBe("Renamed Co");
    expect(data?.type).toBe("business"); // untouched
  });
});

describe("RN-17: last-admin protection", () => {
  test("the sole admin of a workspace cannot remove themselves (DELETE)", async () => {
    const user = await createTestUser("lastadmin-del-solo");
    const workspaceId = await createBusinessWorkspaceAs(user, "Solo Admin Co");
    const { data: membership } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    const { error } = await user.client.from("workspace_members").delete().eq("id", membership!.id);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("LAST_ADMIN");

    await deleteWorkspace(admin, workspaceId);
    await deleteTestUser(admin, user.id);
  });

  test("the sole admin of a workspace cannot demote themselves (UPDATE)", async () => {
    const user = await createTestUser("lastadmin-upd-solo");
    const workspaceId = await createBusinessWorkspaceAs(user, "Solo Admin Co 2");
    const { data: membership } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    const { error } = await user.client.from("workspace_members").update({ role: "member" }).eq("id", membership!.id);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("LAST_ADMIN");

    const { data: check } = await admin.from("workspace_members").select("role").eq("id", membership!.id).single();
    expect(check?.role).toBe("admin");

    await deleteWorkspace(admin, workspaceId);
    await deleteTestUser(admin, user.id);
  });

  test("removal succeeds once a second admin exists, leaving exactly one admin", async () => {
    const admin1 = await createTestUser("lastadmin-ok-a");
    const admin2 = await createTestUser("lastadmin-ok-b");
    const workspaceId = await createBusinessWorkspaceAs(admin1, "Two Admin Co");

    // Fixture: promote admin2 into the workspace as a second admin.
    const { data: admin1Row } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", admin1.id)
      .single();
    await admin.from("workspace_members").insert({ workspace_id: workspaceId, user_id: admin2.id, role: "admin" });

    const { error } = await admin1.client.from("workspace_members").delete().eq("id", admin1Row!.id);
    expect(error).toBeNull();

    const { data: remaining } = await admin
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", workspaceId);
    expect(remaining).toHaveLength(1);
    expect(remaining![0]!.user_id).toBe(admin2.id);
    expect(remaining![0]!.role).toBe("admin");

    await deleteWorkspace(admin, workspaceId);
    await deleteTestUser(admin, admin1.id);
    await deleteTestUser(admin, admin2.id);
  });

  test("member (non-admin) removal is unaffected by last-admin protection", async () => {
    const owner = await createTestUser("lastadmin-member-owner");
    const member = await createTestUser("lastadmin-member-target");
    const workspaceId = await createBusinessWorkspaceAs(owner, "Owner Co");

    const { data: memberRow } = await admin
      .from("workspace_members")
      .insert({ workspace_id: workspaceId, user_id: member.id, role: "member" })
      .select("id")
      .single();

    const { error } = await owner.client.from("workspace_members").delete().eq("id", memberRow!.id);
    expect(error).toBeNull();

    await deleteWorkspace(admin, workspaceId);
    await deleteTestUser(admin, owner.id);
    await deleteTestUser(admin, member.id);
  });

  test("concurrent demotion of both admins leaves exactly one admin, never zero", async () => {
    const admin1 = await createTestUser("lastadmin-race-demote-a");
    const admin2 = await createTestUser("lastadmin-race-demote-b");
    const workspaceId = await createBusinessWorkspaceAs(admin1, "Race Demote Co");

    const { data: admin1Row } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", admin1.id)
      .single();
    const { data: admin2Row } = await admin
      .from("workspace_members")
      .insert({ workspace_id: workspaceId, user_id: admin2.id, role: "admin" })
      .select("id")
      .single();

    // Each admin demotes the OTHER, at the same time. If the advisory lock
    // in prevent_last_admin_demotion() didn't serialize these, both could
    // observe ">=1 admin remaining" and both succeed, leaving zero admins.
    //
    // Two different (both safe) outcomes are possible depending on exactly
    // how the two requests interleave, and which one happens isn't
    // something a test can force over real HTTP requests:
    //  (a) both transactions reach the trigger while each is still admin —
    //      the advisory lock serializes them, and the second gets an
    //      explicit LAST_ADMIN error; or
    //  (b) request A fully completes (demoting the other admin) before
    //      request B's own UPDATE is evaluated — at that point B's caller
    //      is no longer an admin at all, so RLS itself silently filters
    //      B's update to zero rows (no error, no effect), independent of
    //      the trigger.
    // What must hold regardless of which interleaving occurs is the
    // invariant this test is actually about: exactly one admin remains.
    const [r1, r2] = await Promise.all([
      admin1.client.from("workspace_members").update({ role: "member" }).eq("id", admin2Row!.id).select(),
      admin2.client.from("workspace_members").update({ role: "member" }).eq("id", admin1Row!.id).select(),
    ]);

    const errors = [r1.error, r2.error].filter((e): e is NonNullable<typeof e> => e !== null);
    for (const err of errors) {
      expect(err.message).toContain("LAST_ADMIN");
    }

    const { data: admins } = await admin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("role", "admin");
    expect(admins).toHaveLength(1);

    await deleteWorkspace(admin, workspaceId);
    await deleteTestUser(admin, admin1.id);
    await deleteTestUser(admin, admin2.id);
  });

  test("concurrent removal (DELETE) of both admins leaves exactly one admin, never zero", async () => {
    const admin1 = await createTestUser("lastadmin-race-delete-a");
    const admin2 = await createTestUser("lastadmin-race-delete-b");
    const workspaceId = await createBusinessWorkspaceAs(admin1, "Race Delete Co");

    const { data: admin1Row } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", admin1.id)
      .single();
    const { data: admin2Row } = await admin
      .from("workspace_members")
      .insert({ workspace_id: workspaceId, user_id: admin2.id, role: "admin" })
      .select("id")
      .single();

    // See the comment on the UPDATE-race test above: depending on
    // interleaving, the "losing" request either gets an explicit
    // LAST_ADMIN error (both still admins when their triggers run) or is
    // silently filtered to zero rows by RLS (its caller was already
    // demoted-to-nonexistent by the other request completing first). The
    // invariant that must hold either way is checked below.
    const [r1, r2] = await Promise.all([
      admin1.client.from("workspace_members").delete().eq("id", admin2Row!.id).select(),
      admin2.client.from("workspace_members").delete().eq("id", admin1Row!.id).select(),
    ]);

    const errors = [r1.error, r2.error].filter((e): e is NonNullable<typeof e> => e !== null);
    for (const err of errors) {
      expect(err.message).toContain("LAST_ADMIN");
    }

    const { data: remaining } = await admin.from("workspace_members").select("user_id, role").eq("workspace_id", workspaceId);
    expect(remaining!.filter((m) => m.role === "admin")).toHaveLength(1);

    await deleteWorkspace(admin, workspaceId);
    await deleteTestUser(admin, admin1.id);
    await deleteTestUser(admin, admin2.id);
  });
});
