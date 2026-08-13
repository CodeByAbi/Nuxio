-- =============================================================================
-- Migration: 0003_user_profiles
-- Description: user_profiles table + avatars storage bucket
--
-- IMPORTANT: No INSERT policy is created for the `authenticated` role.
--   Rows are created exclusively by the `handle_new_user` trigger (Phase 3,
--   security definer). This migration only supports SELECT + UPDATE by the
--   owning user.
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
--    (row-level policies are still enforced on top of these grants)
-- ---------------------------------------------------------------------------
GRANT SELECT, UPDATE ON public.user_profiles TO authenticated;

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
