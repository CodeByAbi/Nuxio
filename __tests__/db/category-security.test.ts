/**
 * Real-Supabase security tests for `categories` RLS and the invariant
 * trigger added in migration 0007_phase3_security_hardening.sql
 * (trg_protect_category_invariants).
 *
 * Run with: npm run test:db (requires `supabase start`, or CI's equivalent).
 */
import { adminClient, createTestUser, getPersonalWorkspaceId, deleteTestUser, type TestUser } from "./helpers";

const admin = adminClient();

describe("Category isolation (RLS backstop)", () => {
  let userA: TestUser;
  let userB: TestUser;
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    userA = await createTestUser("catiso-a");
    userB = await createTestUser("catiso-b");
    workspaceA = await getPersonalWorkspaceId(admin, userA.id);
    workspaceB = await getPersonalWorkspaceId(admin, userB.id);
  });

  afterAll(async () => {
    await deleteTestUser(admin, userA.id);
    await deleteTestUser(admin, userB.id);
  });

  test("A cannot see B's categories, even unfiltered", async () => {
    const { data, error } = await userA.client.from("categories").select("*");
    expect(error).toBeNull();
    const workspaceIds = (data ?? []).map((c) => c.workspace_id);
    expect(workspaceIds).toContain(workspaceA);
    expect(workspaceIds).not.toContain(workspaceB);
  });

  test("A cannot update B's category", async () => {
    const { data: bCategory } = await admin.from("categories").select("id").eq("workspace_id", workspaceB).limit(1).single();

    const { data, error } = await userA.client
      .from("categories")
      .update({ name: "Hijacked" })
      .eq("id", bCategory!.id)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("A cannot create a category directly in B's workspace", async () => {
    const { error } = await userA.client
      .from("categories")
      .insert({ workspace_id: workspaceB, name: "Intruder", direction: "expense" });
    // Blocked by categories_insert_workspace RLS (workspace_id must be one
    // of A's own workspaces) — RLS reports this as a policy violation, not
    // a silent no-op, since INSERT has no pre-existing row to filter against.
    expect(error).not.toBeNull();
  });
});

describe("Default category protection", () => {
  let user: TestUser;
  let workspaceId: string;
  let defaultCategoryId: string;
  let customCategoryId: string;

  beforeAll(async () => {
    user = await createTestUser("catdefault");
    workspaceId = await getPersonalWorkspaceId(admin, user.id);

    const { data: defaultCat } = await admin
      .from("categories")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_default", true)
      .limit(1)
      .single();
    defaultCategoryId = defaultCat!.id;

    const { data: custom } = await user.client
      .from("categories")
      .insert({ workspace_id: workspaceId, name: "Freelance", direction: "income" })
      .select("id")
      .single();
    customCategoryId = custom!.id;
  });

  afterAll(async () => {
    await deleteTestUser(admin, user.id);
  });

  test("archiving a default category directly is rejected at the database layer", async () => {
    const { error } = await user.client.from("categories").update({ archived: true }).eq("id", defaultCategoryId);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("DEFAULT_CATEGORY");

    const { data: check } = await admin.from("categories").select("archived").eq("id", defaultCategoryId).single();
    expect(check?.archived).toBe(false);
  });

  test("flipping is_default to bypass the archive rule is itself rejected", async () => {
    const { error } = await user.client.from("categories").update({ is_default: false }).eq("id", defaultCategoryId);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("IMMUTABLE_FIELD");

    const { data: check } = await admin.from("categories").select("is_default").eq("id", defaultCategoryId).single();
    expect(check?.is_default).toBe(true);
  });

  test("a custom category cannot have its workspace_id changed", async () => {
    const otherUser = await createTestUser("catdefault-other");
    const otherWorkspaceId = await getPersonalWorkspaceId(admin, otherUser.id);

    const { error } = await user.client
      .from("categories")
      .update({ workspace_id: otherWorkspaceId })
      .eq("id", customCategoryId);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("IMMUTABLE_FIELD");

    const { data: check } = await admin.from("categories").select("workspace_id").eq("id", customCategoryId).single();
    expect(check?.workspace_id).toBe(workspaceId);

    await deleteTestUser(admin, otherUser.id);
  });

  test("archiving a non-default (custom) category still works normally", async () => {
    const { data, error } = await user.client
      .from("categories")
      .update({ archived: true })
      .eq("id", customCategoryId)
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.archived).toBe(true);
  });

  test("renaming a category (a legitimate update) still works", async () => {
    const { data, error } = await user.client
      .from("categories")
      .update({ name: "Freelance Income" })
      .eq("id", customCategoryId)
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.name).toBe("Freelance Income");
  });
});
