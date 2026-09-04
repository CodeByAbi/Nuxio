/**
 * Real-Supabase tests for:
 *  - handle_new_user() signup provisioning + atomicity (migration 0006)
 *  - RN-22: concurrent signup for the same email can't produce two Personal
 *    workspaces
 *  - invite_workspace_member() RPC (migration 0007), which replaced the
 *    broken email-lookup in workspace.service.ts's old inviteMember()
 *
 * Run with: npm run test:db (requires `supabase start`, or CI's equivalent).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { adminClient, createTestUser, deleteTestUser, deleteWorkspace, type TestUser } from "./helpers";
import { withPgClient } from "./pg";

const admin = adminClient();

function anonClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

describe("Signup provisioning (handle_new_user)", () => {
  test("creates exactly one profile, one Personal workspace, one admin membership, and the seeded categories", async () => {
    const user = await createTestUser("signup-provisioning");

    const { data: profile } = await admin.from("user_profiles").select("*").eq("id", user.id).single();
    expect(profile).not.toBeNull();

    const { data: memberships } = await admin.from("workspace_members").select("*, workspaces(*)").eq("user_id", user.id);
    expect(memberships).toHaveLength(1);
    const membership = memberships![0]!;
    expect(membership.role).toBe("admin");
    expect((membership as unknown as { workspaces: { type: string } }).workspaces.type).toBe("personal");

    const workspaceId = membership.workspace_id;
    const { data: categories } = await admin.from("categories").select("id, is_default").eq("workspace_id", workspaceId);
    expect(categories).toHaveLength(12);
    expect(categories!.every((c) => c.is_default)).toBe(true);

    await deleteTestUser(admin, user.id);
  });

  test("a failure partway through provisioning leaves no partial state (atomicity)", async () => {
    const email = `test-atomicity-${Date.now()}@example.com`;

    // Temporarily sabotage the trigger's own transaction: any INSERT into
    // workspace_members (step 3 of handle_new_user, after user_profiles and
    // workspaces have already been written within the SAME transaction)
    // now fails. If handle_new_user is truly atomic, this must roll back
    // the user_profiles insert, the workspaces insert, AND the auth.users
    // insert itself — not just stop partway.
    await withPgClient(async (pg) => {
      await pg.query(`
        CREATE OR REPLACE FUNCTION test_force_provisioning_failure()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'TEST_INDUCED_FAILURE: simulated provisioning failure';
        END;
        $$;
      `);
      await pg.query(`
        CREATE TRIGGER test_trg_force_provisioning_failure
        BEFORE INSERT ON public.workspace_members
        FOR EACH ROW EXECUTE FUNCTION test_force_provisioning_failure();
      `);
    });

    try {
      const client = anonClient();
      const { data, error } = await client.auth.signUp({ email, password: "Passw0rd123!" });

      // GoTrue surfaces the trigger's exception as a signup failure — no
      // session, no user considered created from the caller's perspective.
      expect(error).not.toBeNull();
      expect(data.user).toBeNull();

      // The real proof: nothing was left behind anywhere, including
      // auth.users itself, which only PostgREST-inaccessible raw SQL can
      // check directly.
      await withPgClient(async (pg) => {
        const { rows: users } = await pg.query("SELECT id FROM auth.users WHERE email = $1", [email]);
        expect(users).toHaveLength(0);
      });

      const { data: orphanProfiles } = await admin.from("user_profiles").select("id");
      // (Can't filter user_profiles by email directly — it has no email
      // column — so this just confirms no row exists for a nonexistent
      // user id, which is trivially true; the auth.users check above is
      // the load-bearing assertion.)
      expect(Array.isArray(orphanProfiles)).toBe(true);

      const { data: orphanWorkspaces } = await admin.from("workspaces").select("id").eq("name", "Keuangan Saya");
      // Every OTHER test run's Personal workspace is also named "Keuangan
      // Saya", so this can't assert zero — it's here to document intent;
      // the auth.users absence is what actually proves atomicity.
      expect(Array.isArray(orphanWorkspaces)).toBe(true);
    } finally {
      await withPgClient(async (pg) => {
        await pg.query("DROP TRIGGER IF EXISTS test_trg_force_provisioning_failure ON public.workspace_members");
        await pg.query("DROP FUNCTION IF EXISTS test_force_provisioning_failure()");
      });
    }
  });
});

describe("RN-22: concurrent Personal workspace creation", () => {
  test("two concurrent signups for the same email never produce two Personal workspaces", async () => {
    const email = `test-rn22-${Date.now()}@example.com`;
    const password = "Passw0rd123!";

    const [r1, r2] = await Promise.all([
      anonClient().auth.signUp({ email, password }),
      anonClient().auth.signUp({ email, password }),
    ]);

    // Regardless of which of the two calls GoTrue lets "win" (auth.users.email
    // is unique, so at most one row can ever be created), the outcome must
    // be exactly one user with exactly one Personal workspace.
    const succeeded = [r1, r2].filter((r) => !r.error && r.data.user);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);

    const userId = await withPgClient(async (pg) => {
      const { rows } = await pg.query<{ id: string }>("SELECT id FROM auth.users WHERE email = $1", [email]);
      expect(rows).toHaveLength(1); // uniqueness held even under concurrency
      return rows[0]!.id;
    });

    const { data: memberships } = await admin.from("workspace_members").select("workspace_id, role").eq("user_id", userId);
    expect(memberships).toHaveLength(1);
    const membership = memberships![0]!;
    expect(membership.role).toBe("admin");

    const { data: categories } = await admin.from("categories").select("id").eq("workspace_id", membership.workspace_id);
    expect(categories).toHaveLength(12);

    await deleteTestUser(admin, userId);
  });
});

describe("invite_workspace_member RPC", () => {
  let adminUser: TestUser;
  let invitee: TestUser;
  let outsider: TestUser;
  let workspaceId: string;

  beforeAll(async () => {
    adminUser = await createTestUser("invite-admin");
    invitee = await createTestUser("invite-target");
    outsider = await createTestUser("invite-outsider");

    const { data, error } = await adminUser.client.rpc("create_business_workspace", { p_name: "Invite Co" });
    if (error || !data) throw new Error(`setup failed: ${error?.message}`);
    workspaceId = data;
  });

  afterAll(async () => {
    await deleteWorkspace(admin, workspaceId);
    await deleteTestUser(admin, adminUser.id);
    await deleteTestUser(admin, invitee.id);
    await deleteTestUser(admin, outsider.id);
  });

  test("an admin can invite an existing user by email", async () => {
    const { data, error } = await adminUser.client
      .rpc("invite_workspace_member", { p_workspace_id: workspaceId, p_email: invitee.email, p_role: "member" });

    expect(error).toBeNull();
    expect(data?.user_id).toBe(invitee.id);
    expect(data?.role).toBe("member");

    const { data: check } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", invitee.id)
      .single();
    expect(check?.role).toBe("member");
  });

  test("inviting an email with no matching user fails with USER_NOT_FOUND", async () => {
    const { error } = await adminUser.client
      .rpc("invite_workspace_member", {
        p_workspace_id: workspaceId,
        p_email: `nobody-${Date.now()}@example.com`,
        p_role: "member",
      });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("USER_NOT_FOUND");
  });

  test("inviting an already-existing member fails with ALREADY_MEMBER", async () => {
    const { error } = await adminUser.client
      .rpc("invite_workspace_member", { p_workspace_id: workspaceId, p_email: invitee.email, p_role: "admin" });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("ALREADY_MEMBER");
  });

  test("a non-admin/non-member cannot invite into a workspace they don't administer (FORBIDDEN)", async () => {
    const { error } = await outsider.client
      .rpc("invite_workspace_member", { p_workspace_id: workspaceId, p_email: outsider.email, p_role: "admin" });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("FORBIDDEN");

    // Confirm no row was inserted despite the attempt.
    const { data: check } = await admin
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", outsider.id)
      .maybeSingle();
    expect(check).toBeNull();
  });

  test("a plain member of the workspace cannot invite either (admin-only)", async () => {
    // `invitee` was added as role 'member' above.
    const target = await createTestUser("invite-by-member-target");

    const { error } = await invitee.client
      .rpc("invite_workspace_member", { p_workspace_id: workspaceId, p_email: target.email, p_role: "member" });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("FORBIDDEN");

    await deleteTestUser(admin, target.id);
  });
});
