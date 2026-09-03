/**
 * Shared helpers for the "live" integration suites (`*.live.test.ts`) that
 * exercise real Postgres RLS / Storage RLS against a local Supabase stack,
 * instead of a mocked Supabase client.
 *
 * These suites are opt-in: they auto-skip (via `describeLive`) when
 * `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are not
 * set, or when the URL is not actually reachable — so `npm test` stays green
 * in any environment without Docker/Supabase CLI. To run them for real:
 *
 *   supabase start
 *   supabase db reset   # applies supabase/migrations/*
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_ANON_KEY=<from `supabase status`> \
 *   SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`> \
 *   npm test -- __tests__/integration/live
 *
 * Why bearer-token auth instead of driving the real Next.js route handlers:
 * `lib/server/shared/supabase-server-client.ts` binds to the caller's
 * session via `next/headers` cookies(), which only exists inside an active
 * Next.js request. Outside of that (a plain Jest process), there is no
 * faithful way to fabricate that request scope without reverse-engineering
 * `@supabase/ssr`'s internal cookie-chunking format — which would make the
 * test brittle to an implementation detail unrelated to what's being
 * verified. RLS/Storage policies authorize based on the JWT's `sub` claim
 * regardless of whether that JWT arrived via a cookie-bound session or an
 * `Authorization: Bearer` header — both paths validate the same token and
 * populate the same `auth.uid()` for policy evaluation. Route-level wiring
 * (that `requireAuth()` is called, that userId comes from the session and
 * not the request body) is already covered by the mocked
 * `__tests__/integration/profile.test.ts`; this suite's job is specifically
 * to prove the security boundary that mocks cannot: real RLS.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface LiveConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export function getLiveConfig(): LiveConfig | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) return null;
  return { url, anonKey, serviceRoleKey };
}

export async function isReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${url}/auth/v1/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * `describe.skip` with a clear reason when the live stack isn't available,
 * otherwise a normal `describe`. Use exactly like `describe`.
 */
export function describeLive(name: string, fn: (config: LiveConfig) => void): void {
  const config = getLiveConfig();

  if (!config) {
    describe.skip(`${name} (skipped: SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY not set)`, () => {
      fn({ url: "", anonKey: "", serviceRoleKey: "" });
    });
    return;
  }

  // Reachability is checked lazily inside `beforeAll` (via `skipIfUnreachable`)
  // rather than here, since top-level `describe` bodies can't be async.
  describe(name, () => fn(config));
}

/**
 * Call from a `beforeAll`. Env vars being set is an explicit opt-in to run
 * these live — so if the stack isn't actually reachable, this throws (a
 * loud, correct failure) rather than silently skipping.
 */
export async function assertReachable(config: LiveConfig): Promise<void> {
  if (!config.url) return; // already-skipped describeLive branch (no env vars at all)
  const ok = await isReachable(config.url);
  if (!ok) {
    throw new Error(
      `SUPABASE_URL=${config.url} is configured but not reachable. Run \`supabase start\` (and \`supabase db reset\`) first, or unset SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY to skip these live tests.`,
    );
  }
}

let counter = 0;

/** Creates a fresh confirmed test user via the admin API and returns an authenticated (anon-key + bearer token) client for them. */
export async function createLiveTestUser(
  config: LiveConfig,
  label: string,
): Promise<{ userId: string; email: string; client: SupabaseClient; admin: SupabaseClient }> {
  counter += 1;
  const email = `${label}-${Date.now()}-${counter}@live-test.local`;
  const password = "Password123!Test";

  const admin = createClient(config.url, config.serviceRoleKey);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`createLiveTestUser: failed to create ${label}: ${createErr?.message}`);
  }

  const anon = createClient(config.url, config.anonKey);
  const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn.session) {
    throw new Error(`createLiveTestUser: failed to sign in ${label}: ${signInErr?.message}`);
  }

  const client = createClient(config.url, config.anonKey, {
    global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
  });

  return { userId: created.user.id, email, client, admin };
}

/**
 * Seeds a `user_profiles` row the way Phase 3's `handle_new_user` trigger
 * eventually will, using the service-role (admin) client. Throws loudly on
 * failure instead of swallowing the error — a silent failure here would
 * otherwise surface as confusing "0 rows returned" assertions deep in the
 * RLS tests, masking a fixture problem as a false RLS failure.
 */
export async function seedProfile(admin: SupabaseClient, userId: string, displayName: string): Promise<void> {
  const { error } = await admin.from("user_profiles").insert({ id: userId, display_name: displayName });
  if (error) {
    throw new Error(`seedProfile: failed to seed profile for ${userId}: ${error.message}`);
  }
}

/** Deletes a live test user (cascades to `user_profiles` via ON DELETE CASCADE) and best-effort removes their avatar object. */
export async function cleanupLiveTestUser(config: LiveConfig, userId: string): Promise<void> {
  const admin = createClient(config.url, config.serviceRoleKey);
  await admin.storage.from("avatars").remove([`user/${userId}/avatar`]).catch(() => undefined);
  await admin.auth.admin.deleteUser(userId).catch(() => undefined);
}
