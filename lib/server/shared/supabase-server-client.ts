import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getRequiredEnv } from "@/lib/server/shared/env";
import type { Database } from "@/types/database";

/**
 * Supabase client for Route Handlers and Server Components. Carries the
 * user's session cookie so `auth.uid()` is populated inside RLS policies —
 * this is the ONLY client user-request code should use to read/write data
 * (see `supabase-admin-client.ts` for the RLS-bypassing exception).
 *
 * Must be created fresh per request — never module-level cached/shared.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    getRequiredEnv("SUPABASE_URL"),
    getRequiredEnv("SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component, which cannot set cookies.
            // Session refresh is instead handled by middleware.ts.
          }
        },
      },
    },
  );
}
