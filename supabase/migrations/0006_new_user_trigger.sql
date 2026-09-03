-- =============================================================================
-- Migration: 0006_new_user_trigger
-- Description: handle_new_user trigger + create_business_workspace RPC
--
-- This migration establishes automatic Personal workspace creation on signup:
--   1. handle_new_user() trigger function (security definer, bypasses RLS)
--   2. Trigger on auth.users AFTER INSERT
--   3. RPC for creating Business workspaces
--
-- When a user signs up via Supabase Auth:
--   - Trigger fires automatically
--   - Creates user_profiles row (Phase 2)
--   - Creates Personal workspace ("Keuangan Saya")
--   - Makes user an admin member
--   - Seeds default categories from default_categories_personal
--
-- All in ONE atomic transaction — failure in any step rolls back everything.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. handle_new_user() trigger function
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: runs with elevated privileges, bypassing RLS
-- This is intentional — new users don't have workspace membership yet,
-- so RLS would block their own workspace creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_workspace_id uuid;
BEGIN
  -- Step 1: Create user_profiles row (Phase 2 table)
  -- Default display name = email username (before @)
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      split_part(NEW.email, '@', 1),  -- username from email
      'User'                          -- fallback
    )
  );

  -- Step 2: Create Personal workspace
  INSERT INTO public.workspaces (name, type, currency, timezone, plan)
  VALUES (
    'Keuangan Saya',    -- default name for Personal workspace
    'personal',
    'IDR',              -- default currency
    'Asia/Jakarta',     -- default timezone
    'free'              -- default plan (MVP: only free tier)
  )
  RETURNING id INTO new_workspace_id;

  -- Step 3: Make user an admin member of their Personal workspace
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, NEW.id, 'admin');

  -- Step 4: Seed default categories from reference table
  INSERT INTO public.categories (workspace_id, name, direction, is_default)
  SELECT 
    new_workspace_id,
    name,
    direction,
    true  -- mark as default category
  FROM public.default_categories_personal;

  RETURN NEW;
END;
$$;

-- Grant execute to service role (Supabase Auth uses service role internally)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Trigger on auth.users
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. create_business_workspace() RPC
-- ---------------------------------------------------------------------------
-- Called by authenticated users to create a Business workspace
-- (Personal workspace is auto-created by trigger above)
--
-- Returns the new workspace_id on success
CREATE OR REPLACE FUNCTION public.create_business_workspace(
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_user_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate workspace name length (3-50 characters)
  IF char_length(p_name) < 3 OR char_length(p_name) > 50 THEN
    RAISE EXCEPTION 'Workspace name must be between 3 and 50 characters';
  END IF;

  -- Step 1: Create Business workspace
  INSERT INTO public.workspaces (name, type, currency, timezone, plan)
  VALUES (
    p_name,
    'business',
    'IDR',              -- default currency
    'Asia/Jakarta',     -- default timezone
    'free'              -- default plan (MVP: only free tier)
  )
  RETURNING id INTO v_workspace_id;

  -- Step 2: Make calling user an admin member
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'admin');

  -- Step 3: Seed default categories from business reference table
  INSERT INTO public.categories (workspace_id, name, direction, is_default)
  SELECT 
    v_workspace_id,
    name,
    direction,
    true  -- mark as default category
  FROM public.default_categories_business;

  -- Return the new workspace_id
  RETURN v_workspace_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_business_workspace(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Helper function: prevent deletion of last admin (RN-17)
-- ---------------------------------------------------------------------------
-- This function is called before DELETE on workspace_members
-- Blocks removal if it would leave zero admins in the workspace
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_count integer;
BEGIN
  -- Only check if the member being deleted is an admin
  IF OLD.role = 'admin' THEN
    -- Count remaining admins after this deletion
    SELECT COUNT(*) INTO v_admin_count
    FROM public.workspace_members
    WHERE workspace_id = OLD.workspace_id
      AND role = 'admin'
      AND id <> OLD.id;  -- exclude the row being deleted
    
    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'LAST_ADMIN: Cannot remove the last admin from workspace';
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

-- Attach trigger to workspace_members
DROP TRIGGER IF EXISTS trg_prevent_last_admin_removal ON public.workspace_members;
CREATE TRIGGER trg_prevent_last_admin_removal
  BEFORE DELETE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_admin_removal();

-- Grant execute to authenticated (needed for DELETE policy)
GRANT EXECUTE ON FUNCTION public.prevent_last_admin_removal() TO authenticated;
