-- =============================================================================
-- Migration: 0003_user_profiles
-- Description: user_profiles table + avatars storage bucket
--
-- IMPORTANT: No INSERT policy is created for the `authenticated` role.
--   Rows are created exclusively by the `handle_new_user` trigger (Phase 3,
--   security definer). This migration only supports SELECT + UPDATE by the
--   owning user.
--
-- NOTE ON `avatar_url`: despite the column name (kept as-is to match the
--   roadmap schema and avoid an unnecessary rename), the value persisted here
--   is the deterministic Storage OBJECT PATH (`user/<userId>/avatar`), never
--   a signed URL. Signed URLs expire (1h) and must never be treated as
--   permanent state — `lib/server/profile/avatar.service.ts` resolves a
--   fresh signed URL from this path on every read. See that file's
--   `resolveAvatarUrl()` for details.
--
-- NOTE ON set_updated_at(): Phase 0 (`docs/17. Roadmap.md`) specifies this
--   function is created by `0002_helper_functions.sql`. That migration (and
--   `0001_extensions.sql`) do not exist anywhere in this repository's history
--   (verified across every branch) — Phase 0's DB migrations were never
--   actually committed, only documented. This migration defines
--   `set_updated_at()` itself via `CREATE OR REPLACE` (idempotent) so Phase 2
--   is not blocked on that gap. This is a bootstrap, not a duplicate: if/when
--   a real `0002_helper_functions.sql` is added, its `CREATE OR REPLACE`
--   will simply re-affirm the same definition without conflict. The Phase 0
--   gap itself should still be tracked and closed separately — it is out of
--   scope for a Phase 2 fix to silently paper over by inventing Phase 0
--   migration files here.
--
-- HOW TO TEST (Phase 3 trigger not yet in place):
--   Run the following in the Supabase SQL editor, replacing <user-uuid> with a
--   real auth.users.id from your project:
--
--   INSERT INTO public.user_profiles (id, display_name)
--   VALUES ('<user-uuid>', 'Test User');
--
--   Then test GET /api/profile and PATCH /api/profile while authenticated as
--   that user. Remove this manual row before Phase 3 deploys handle_new_user.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. set_updated_at() function (idempotent — created if it does not exist)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. user_profiles table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name varchar(50) NOT NULL CHECK (char_length(display_name) >= 1),
  avatar_url   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.user_profiles.avatar_url IS
  'Deterministic Storage object path (user/<userId>/avatar), NOT a signed URL. '
  'Signed URLs are generated fresh on every read and must never be persisted here.';

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_user_profiles_set_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_set_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Row-Level Security
--    - SELECT  : owner only
--    - UPDATE  : owner only
--    - INSERT  : NO policy for 'authenticated' role
--                (Phase 3 handle_new_user runs as SECURITY DEFINER and
--                 bypasses RLS; this is intentional)
--    - DELETE  : none
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Ensure policies are idempotent
DROP POLICY IF EXISTS "user_profiles_select_own" ON public.user_profiles;
CREATE POLICY "user_profiles_select_own"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "user_profiles_update_own" ON public.user_profiles;
CREATE POLICY "user_profiles_update_own"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 4. Grant table-level privileges to the roles that Supabase API uses
--    (row-level policies are still enforced on top of these grants for
--    `authenticated`; `service_role` has BYPASSRLS so RLS does not apply to
--    it, but Postgres still requires an explicit object-level GRANT
--    independently of BYPASSRLS — without this, `supabase-admin-client.ts`
--    (service-role key, used by background jobs / Phase 3's future
--    `handle_new_user` seeding path / admin tooling) gets a bare
--    "permission denied for table user_profiles", regardless of RLS.
-- ---------------------------------------------------------------------------
GRANT SELECT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Supabase Storage — avatars bucket
--
--    NOTE: Bucket creation via SQL is only needed when running against the
--    local Supabase CLI stack (supabase start). On the hosted platform the
--    bucket is created via the dashboard or `supabase storage create-bucket`.
--    The INSERT below is safe to run multiple times due to ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Storage RLS policies
--    Path convention: user/<userId>/avatar[.<ext>]
--    We compare auth.uid()::text with the first segment after "user/" in the
--    object name to ensure users can only access their own avatars.
-- ---------------------------------------------------------------------------

-- Allow owner to read (SELECT) their own avatar objects
DROP POLICY IF EXISTS "avatars_select_own" ON storage.objects;
CREATE POLICY "avatars_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'user'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Allow owner to upload (INSERT) into their own path
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'user'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Allow owner to delete their own avatar objects (needed for cleanup on re-upload)
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'user'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Allow owner to overwrite (UPDATE) their own avatar object. Required for
-- avatar REPLACEMENT: `avatar.service.ts` uploads with `upsert: true`, and
-- when an object already exists at the target path, Supabase Storage
-- performs an UPDATE on storage.objects (not a fresh INSERT). Without this
-- policy, RLS defaults to deny and every replacement upload fails with
-- "new row violates row-level security policy" even for the object's own
-- owner — this was a confirmed regression (see Phase 2 review). Scoped
-- identically to the SELECT/INSERT/DELETE policies above: owner-only, same
-- bucket, same path convention. USING gates which existing row may be
-- touched; WITH CHECK gates what the row may become — both must hold, so a
-- user can never retarget an update to land under another user's prefix.
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'user'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'user'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
