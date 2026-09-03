import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import { childLogger } from "@/lib/server/shared/logger";
import { ValidationError, InternalError } from "@/lib/server/shared/errors";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const log = childLogger("avatar-service");

/** Permitted MIME types for avatar uploads. */
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Maximum file size: 2 MB in bytes. */
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

/** Signed URL expiry in seconds (1 hour). */
export const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

/** Deterministic Storage object path for a user's avatar — one object per user, ever. */
export function avatarStoragePath(userId: string): string {
  return `user/${userId}/avatar`;
}

/**
 * Resolve the stable avatar path stored in `user_profiles.avatar_url` into a
 * fresh, short-lived signed URL. Never persist the result — call this on
 * every read instead. Returns `null` if there is no avatar, or if signing
 * fails (e.g. the object was removed out-of-band); callers should treat both
 * cases identically ("no avatar to show") rather than surfacing an error.
 */
export async function resolveAvatarUrl(
  supabase: SupabaseClient<Database>,
  avatarPath: string | null,
): Promise<string | null> {
  if (!avatarPath) return null;

  const { data, error } = await supabase.storage.from("avatars").createSignedUrl(avatarPath, SIGNED_URL_EXPIRY_SECONDS);

  if (error || !data?.signedUrl) {
    log.warn({ avatarPath, err: error?.message }, "resolveAvatarUrl: failed to sign, treating as no avatar");
    return null;
  }

  return data.signedUrl;
}

/**
 * Upload (or replace) an avatar for the given user.
 *
 * Sequence:
 *  1. Validate MIME type against whitelist (JPEG, PNG, WebP).
 *  2. Validate file size (≤ 2 MB).
 *  3. Upload to the fixed path `user/<userId>/avatar` with `upsert: true`.
 *     There is exactly one avatar object per user — replacing an avatar
 *     overwrites that same object in place; there is no separate "old"
 *     object to clean up afterward. (An earlier version of this function
 *     additionally called `remove()` on the same path right after upload,
 *     intending to "delete the old avatar" — since old and new share the
 *     one deterministic path, that call deleted the file just written,
 *     leaving the user with no avatar at all after every replacement. That
 *     step has been removed; `upsert: true` alone is both necessary and
 *     sufficient for replacement.)
 *  4. Persist the stable PATH (not a signed URL — those expire) to
 *     `user_profiles.avatar_url`.
 *  5. Generate a fresh signed URL for the immediate API response.
 *
 * Overwriting an existing object via `upsert: true` performs an UPDATE on
 * `storage.objects`, which requires the `avatars_update_own` RLS policy
 * (see `0003_user_profiles.sql`) in addition to the INSERT policy used for
 * first-time uploads.
 *
 * Target: p95 < 3 s end-to-end.
 */
export async function uploadAvatar(userId: string, file: File | Buffer, mimeType?: string): Promise<string> {
  // ── 1. Validate MIME type ────────────────────────────────────────────────
  const resolvedMime = file instanceof File ? file.type : (mimeType ?? "application/octet-stream");

  if (!ALLOWED_MIME_TYPES.has(resolvedMime)) {
    throw new ValidationError(
      `Unsupported file type: "${resolvedMime}". Allowed types are JPEG, PNG, and WebP.`,
      [{ field: "file", message: "Must be a JPEG, PNG, or WebP image." }],
    );
  }

  // ── 2. Validate file size ────────────────────────────────────────────────
  const fileSize = file instanceof File ? file.size : (file as Buffer).byteLength;

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(
      `File too large: ${(fileSize / 1024 / 1024).toFixed(2)} MB. Maximum allowed is 2 MB.`,
      [{ field: "file", message: "File must be 2 MB or smaller." }],
    );
  }

  const supabase = await createSupabaseServerClient();
  const storagePath = avatarStoragePath(userId);

  // ── 3. Upload (create or replace) ────────────────────────────────────────
  const fileBody = file instanceof File ? file : Buffer.from(file);

  const { error: uploadError } = await supabase.storage.from("avatars").upload(storagePath, fileBody, {
    contentType: resolvedMime,
    upsert: true,
  });

  if (uploadError) {
    log.error({ userId, storageError: uploadError.message }, "uploadAvatar: upload failed");
    throw new InternalError("Avatar upload failed. Please try again.", { cause: uploadError });
  }

  log.info({ userId }, "uploadAvatar: upload succeeded");

  // ── 4. Persist the stable path (never a signed URL) ─────────────────────
  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ avatar_url: storagePath })
    .eq("id", userId);

  if (updateError) {
    log.error({ userId, dbError: updateError.message }, "uploadAvatar: failed to persist avatar path");
    throw new InternalError("Avatar uploaded but profile could not be updated.", { cause: updateError });
  }

  log.info({ userId }, "uploadAvatar: avatar path persisted");

  // ── 5. Generate a fresh signed URL for the response ──────────────────────
  const signedUrl = await resolveAvatarUrl(supabase, storagePath);

  if (!signedUrl) {
    log.error({ userId }, "uploadAvatar: upload succeeded but signing failed immediately after");
    throw new InternalError("Avatar uploaded but could not generate access URL.");
  }

  return signedUrl;
}
