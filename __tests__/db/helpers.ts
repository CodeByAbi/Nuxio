/**
 * Shared fixtures for the real-Supabase test suite (`npm run test:db`).
 *
 * These tests talk to an actual Postgres + GoTrue instance (local via
 * `supabase start`, or CI's equivalent — see .github/workflows/ci.yml) to
 * prove RLS policies and triggers hold even when nothing in this repo's own
 * application code is involved. Every security assertion in this suite must
 * run through an authenticated user's own client, exactly like a direct
 * PostgREST call would — the service-role client is for fixture setup and
 * cleanup ONLY, never for the assertions themselves.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { withPgClient } from "./pg";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. These tests need a real Supabase instance — run "supabase start" locally, ` +
        `or check CI's env wiring in .github/workflows/ci.yml.`,
    );
  }
  return value;
}

export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient<Database>;
}

/**
 * Signs up a brand-new user (unique email per call) and returns a
 * client authenticated as them — the same trust level as a real logged-in
 * browser session, i.e. exactly what RLS policies actually see.
 */
export async function createTestUser(label: string): Promise<TestUser> {
  // Kept short deliberately: handle_new_user() derives user_profiles.display_name
  // (varchar(50)) from split_part(email, '@', 1) with no truncation, so a long
  // local-part here fails signup itself with "value too long for type
  // character varying(50)" — a real constraint, not a test-only concern.
  const shortLabel = label.slice(0, 12);
  const email = `t-${shortLabel}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;
  const password = "Passw0rd123!";

  const client = createClient<Database>(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signUp({ email, password });
  if (error || !data.user) {
    throw new Error(`Failed to sign up test user ${email}: ${error?.message}`);
  }

  return { id: data.user.id, email, client };
}

/** The workspace_id of a freshly-signed-up user's auto-created Personal workspace. */
export async function getPersonalWorkspaceId(admin: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data, error } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error(`No workspace membership found for user ${userId}: ${error?.message}`);
  }

  return data.workspace_id;
}

/**
 * Permanently removes a test user (and everything FK-cascaded from it,
 * including workspace_members and GoTrue's own auxiliary tables).
 *
 * Deliberately raw SQL with triggers disabled for this one session, rather
 * than admin.auth.admin.deleteUser(): the last-admin trigger this migration
 * adds correctly fires on the cascaded workspace_members delete too (a
 * solo test user is always the sole admin of their own Personal
 * workspace), which is exactly the intended protection working — it just
 * means normal deletion can't be used for test teardown. This is
 * fixture-only; nothing in the app is allowed to do this.
 */
export async function deleteTestUser(_admin: SupabaseClient<Database>, userId: string): Promise<void> {
  await withPgClient(async (pg) => {
    await pg.query("SET session_replication_role = replica");
    try {
      await pg.query("DELETE FROM auth.users WHERE id = $1", [userId]);
    } finally {
      await pg.query("SET session_replication_role = DEFAULT");
    }
  });
}

/**
 * Deletes a workspace's rows directly, triggers disabled — same reasoning
 * as deleteTestUser: the last-admin trigger correctly blocks removing a
 * sole admin's membership, which fixture teardown must bypass on purpose.
 */
export async function deleteWorkspace(_admin: SupabaseClient<Database>, workspaceId: string): Promise<void> {
  await withPgClient(async (pg) => {
    await pg.query("SET session_replication_role = replica");
    try {
      await pg.query("DELETE FROM public.categories WHERE workspace_id = $1", [workspaceId]);
      await pg.query("DELETE FROM public.workspace_members WHERE workspace_id = $1", [workspaceId]);
      await pg.query("DELETE FROM public.workspaces WHERE id = $1", [workspaceId]);
    } finally {
      await pg.query("SET session_replication_role = DEFAULT");
    }
  });
}
