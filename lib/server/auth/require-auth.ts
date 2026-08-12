import { AuthenticationError } from "@/lib/server/shared/errors";
import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import type { AuthUser } from "@/types/auth";

/**
 * Always `getUser()`, never `getSession()`: `getSession()` only reads the
 * JWT already cached in the cookie without re-checking it against Supabase,
 * so a revoked/expired token would still read as "logged in." `getUser()`
 * round-trips to Supabase Auth and re-validates the token on every call.
 */
export async function requireAuth(): Promise<AuthUser> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || !data.user.email) {
    throw new AuthenticationError();
  }

  return { id: data.user.id, email: data.user.email };
}
