import { RateLimitError } from "@/lib/server/shared/errors";
import { rateLimit } from "@/lib/server/shared/rate-limit";
import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import type { AuthUser } from "@/types/auth";

const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export interface AuthResult {
  user: AuthUser | null;
  error: { message: string } | null;
}

/**
 * Thin wrappers over `supabase.auth.*`. Rate limiting lives here rather than
 * in a route handler because RN-14 gives Auth no `/api/auth/*` routes to
 * attach middleware to — every caller (Server Action, test) goes through
 * these functions directly, so this is the only place the limit applies.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  ip: string
): Promise<AuthResult> {
  const limit = await rateLimit(`auth:register:${ip}`, REGISTER_LIMIT, REGISTER_WINDOW_MS);
  if (!limit.success) {
    throw new RateLimitError("Too many registration attempts. Please try again later.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user || !data.user.email) {
    return { user: null, error: { message: error?.message ?? "Registration failed." } };
  }

  return { user: { id: data.user.id, email: data.user.email }, error: null };
}

export async function signInWithEmail(
  email: string,
  password: string,
  ip: string
): Promise<AuthResult> {
  const limit = await rateLimit(`auth:login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);
  if (!limit.success) {
    throw new RateLimitError("Too many login attempts. Please try again later.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.user.email) {
    return { user: null, error: { message: error?.message ?? "Invalid email or password." } };
  }

  return { user: { id: data.user.id, email: data.user.email }, error: null };
}

export async function signOut(): Promise<{ error: { message: string } | null }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  return { error: error ? { message: error.message } : null };
}
