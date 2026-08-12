/**
 * Minimal authenticated-user shape the auth module hands out. Profile fields
 * (display name, avatar) belong to `user_profiles` (Phase 2) — this type
 * only carries what Supabase Auth itself owns.
 */
export interface AuthUser {
  id: string;
  email: string;
}
