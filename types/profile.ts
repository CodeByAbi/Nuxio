import { z } from "zod";

/**
 * Domain type for a user's profile row in `user_profiles`.
 * Matches the columns returned by GET /api/profile.
 */
export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

/**
 * Extended profile shape returned by PATCH — includes `updated_at` so the
 * client can display "last saved" feedback without a follow-up GET.
 */
export type ProfileWithTimestamps = Profile & {
  updated_at: string;
};

/**
 * Zod schema for the PATCH /api/profile request body.
 * Rules mirror the DB CHECK constraint: 1–50 chars, no leading/trailing whitespace.
 */
export const updateProfileSchema = z.object({
  display_name: z
    .string()
    .min(1, "Display name must be at least 1 character.")
    .max(50, "Display name must be at most 50 characters."),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
