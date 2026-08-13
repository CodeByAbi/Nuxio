import { NotFoundError, InternalError } from "@/lib/server/shared/errors";
import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import { childLogger } from "@/lib/server/shared/logger";
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

  return data as Profile;
}

/**
 * Update the `display_name` for the authenticated user's profile.
 *
 * Returns the full updated row including timestamps.
 *
 * RN-11: `display_name` input is never written to logs — only structural
 * metadata (userId, success/failure) is logged.
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

  return data as ProfileWithTimestamps;
}
