import { NotFoundError, InternalError } from "@/lib/server/shared/errors";
import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import { childLogger } from "@/lib/server/shared/logger";
import { resolveAvatarUrl } from "@/lib/server/profile/avatar.service";
import type { Profile, ProfileWithTimestamps } from "@/types/profile";

const log = childLogger("profile-service");

/**
 * Fetch the profile row for the authenticated user.
 *
 * Throws `NotFoundError` (404) if no row exists — this is expected before
 * the Phase 3 `handle_new_user` trigger creates the row automatically.
 * Never throws an unhandled exception for the "row missing" case.
 *
 * RN-11: `display_name` is NEVER logged here.
 *
 * `avatar_url` in the DB row is a stable Storage path, not a URL — it is
 * resolved into a fresh signed URL on every call so the response never
 * carries an expired link. See `avatar.service.ts#resolveAvatarUrl`.
 */
export async function getProfile(userId: string): Promise<Profile> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    log.error({ userId, dbError: error.message }, "getProfile: database error");
    throw new InternalError("Failed to load profile.", { cause: error });
  }

  if (!data) {
    log.info({ userId }, "getProfile: profile row not found (Phase 3 trigger not yet run)");
    throw new NotFoundError(
      "Your profile has not been set up yet. It will be created automatically once you complete onboarding.",
    );
  }

  const avatarUrl = await resolveAvatarUrl(supabase, data.avatar_url);

  return { id: data.id, display_name: data.display_name, avatar_url: avatarUrl };
}

/**
 * Update the `display_name` for the authenticated user's profile.
 *
 * Returns the full updated row including timestamps.
 *
 * RN-11: `display_name` input is never written to logs — only structural
 * metadata (userId, success/failure) is logged.
 *
 * `avatar_url` is resolved to a fresh signed URL the same way `getProfile`
 * does, since the PATCH response also carries this field per the API
 * contract.
 */
export async function updateProfile(
  userId: string,
  { display_name }: { display_name: string },
): Promise<ProfileWithTimestamps> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("user_profiles")
    .update({ display_name })
    .eq("id", userId)
    .select("id, display_name, avatar_url, updated_at")
    .single();

  if (error) {
    log.error({ userId, dbError: error.message }, "updateProfile: database error");
    throw new InternalError("Failed to update profile.", { cause: error });
  }

  log.info({ userId }, "updateProfile: display_name updated successfully");

  const avatarUrl = await resolveAvatarUrl(supabase, data.avatar_url);

  return { id: data.id, display_name: data.display_name, avatar_url: avatarUrl, updated_at: data.updated_at };
}
