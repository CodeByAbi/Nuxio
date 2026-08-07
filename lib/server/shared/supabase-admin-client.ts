import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * !!! DANGER — SERVICE ROLE CLIENT — RLS IS BYPASSED ENTIRELY !!!
 *
 * This client authenticates with `SUPABASE_SERVICE_ROLE_KEY` and can read
 * and write ANY workspace's data, ignoring every RLS policy.
 *
 * Allowed callers ONLY:
 *   - Background jobs (`app/api/jobs/*`, verified via `CRON_SECRET`)
 *   - Admin-only routes with their own out-of-band authorization
 *
 * NEVER:
 *   - Use this on a user-facing request path (use
 *     `supabase-server-client.ts` instead, which carries the caller's
 *     session so RLS stays the enforcement layer).
 *   - Import this module from client/browser code, or any code reachable
 *     from it — `SUPABASE_SERVICE_ROLE_KEY` must never reach the browser.
 *   - Query without manually scoping by `workspace_id` yourself; there is
 *     no RLS backstop here if you forget.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
