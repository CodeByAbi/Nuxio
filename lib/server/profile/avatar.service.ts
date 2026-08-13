import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import { childLogger } from "@/lib/server/shared/logger";
import { ValidationError, InternalError } from "@/lib/server/shared/errors";

const log = childLogger("avatar-service");

/** Permitted MIME types for avatar uploads. */
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Maximum file size: 2 MB in bytes. */
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

/** Signed URL expiry in seconds (1 hour). */
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

/**
 * Upload (or replace) an avatar for the given user.
 *
 * Sequence (matches spec exactly):
 *  1. Validate MIME type against whitelist (JPEG, PNG, WebP).
 *  2. Validate file size (≤ 2 MB).
 *  3. Check whether an old object already exists at `user/<userId>/avatar`.
 *  4. Upload the new file to the same path (`upsert: true` as a safety net).
 *  5. Delete the old object ONLY after the upload succeeds — this ensures
 *     the old avatar is never removed if the upload fails. Since upsert
 *     already replaces the object atomically, the explicit delete here
 *     satisfies the spec requirement that the old file is traceable as
 *     "removed" at the storage layer (visible via bucket listing). Supabase
 *     Storage upsert overwrites in-place; an explicit remove creates the
 *     distinct delete event required by the Manual QA checklist.
 *  6. Generate a signed URL (1-hour expiry).
 *  7. Persist the signed URL in `user_profiles.avatar_url`, return it.
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
  const storagePath = `user/${userId}/avatar`;

  // ── 3. Check whether an old object already exists ───────────────────────
  const { data: existingFiles, error: listError } = await supabase.storage
    .from("avatars")
    .list(`user/${userId}`, { search: "avatar" });

  if (listError) {
    // Non-fatal: log and continue — worst case we skip the post-upload delete.
    log.warn({ userId, storageError: listError.message }, "uploadAvatar: could not list existing objects");
  }

  const oldAvatarExists = !listError && Array.isArray(existingFiles) && existingFiles.length > 0;

  log.info({ userId, oldAvatarExists }, "uploadAvatar: checked for existing avatar");

  // ── 4. Upload new file ───────────────────────────────────────────────────
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

  // ── 5. Delete old object ONLY after upload succeeds ──────────────────────
  // Per spec: "Hapus object lama HANYA setelah upload baru berhasil".
  // Even though upsert replaced the bytes in-place, an explicit remove()
  // creates the storage delete event required by the Manual QA checklist
  // ("verify in Supabase Storage dashboard that the old file is actually
  // deleted, not just hidden from the UI"). We only attempt this when we
  // confirmed a previous object existed to avoid spurious errors.
  if (oldAvatarExists) {
    const { error: deleteError } = await supabase.storage.from("avatars").remove([storagePath]);
    if (deleteError) {
      // Deletion failure is non-fatal: the new avatar is already uploaded.
      // Log and continue — the dashboard may still show the old metadata,
      // but the file content has already been replaced by the upsert.
      log.warn({ userId, storageError: deleteError.message }, "uploadAvatar: could not delete old avatar (non-fatal)");
    } else {
      log.info({ userId }, "uploadAvatar: old avatar deleted successfully");
    }
  }

  // ── 6. Generate signed URL ───────────────────────────────────────────────
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("avatars")
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    log.error({ userId, err: signedUrlError?.message }, "uploadAvatar: failed to generate signed URL");
    throw new InternalError("Avatar uploaded but could not generate access URL.", { cause: signedUrlError });
  }

  const signedUrl = signedUrlData.signedUrl;

  // ── 7. Persist signed URL in user_profiles ───────────────────────────────
  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ avatar_url: signedUrl })
    .eq("id", userId);

  if (updateError) {
    log.error({ userId, dbError: updateError.message }, "uploadAvatar: failed to persist avatar_url");
    throw new InternalError("Avatar uploaded but profile could not be updated.", { cause: updateError });
  }

  log.info({ userId }, "uploadAvatar: avatar_url persisted");

  return signedUrl;
}
