-- =============================================================================
-- Migration: 0004_workspace
-- Description: workspaces table, workspace_members table, complete auth_workspace_ids()
--
-- This is the core multi-tenancy foundation. Every financial table from here
-- forward will filter by workspace_id. This migration establishes:
--   1. workspaces table (Personal/Business)
--   2. workspace_members table (admin/member roles)
--   3. Complete implementation of auth_workspace_ids() (stubbed in Phase 0)
--
-- RLS enforcement: Two-layer model
--   - Layer 1 (app): workspace-guard.ts verifies membership before query
--   - Layer 2 (DB): RLS policies ensure no cross-workspace leakage even if
--                   app layer is bypassed
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE workspace_type AS ENUM ('personal', 'business');
CREATE TYPE workspace_role AS ENUM ('admin', 'member');
CREATE TYPE plan_tier AS ENUM ('free');  -- MVP: only free tier

-- ---------------------------------------------------------------------------
-- 2. workspaces table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspaces (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       varchar(50) NOT NULL CHECK (char_length(name) BETWEEN 3 AND 50),
  type       workspace_type NOT NULL,
  currency   char(3)     NOT NULL DEFAULT 'IDR',
  timezone   text        NOT NULL DEFAULT 'Asia/Jakarta',
  plan       plan_tier   NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger: auto-update updated_at
DROP TRIGGER IF EXISTS trg_workspaces_set_updated_at ON public.workspaces;
CREATE TRIGGER trg_workspaces_set_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. workspace_members table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         workspace_role NOT NULL DEFAULT 'member',
  invited_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- Index: critical for auth_workspace_ids() performance
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id 
  ON public.workspace_members(user_id);

-- ---------------------------------------------------------------------------
-- 4. Complete auth_workspace_ids() function (stubbed in Phase 0)
-- ---------------------------------------------------------------------------
-- This function is called by RLS policies on every workspace-scoped table.
-- SECURITY DEFINER + STABLE ensures it's evaluated once per statement.
CREATE OR REPLACE FUNCTION public.auth_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT workspace_id 
  FROM public.workspace_members 
  WHERE user_id = auth.uid();
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.auth_workspace_ids() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Row-Level Security — workspaces
-- ---------------------------------------------------------------------------
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- SELECT: member can see their workspace
DROP POLICY IF EXISTS "workspaces_select_member" ON public.workspaces;
CREATE POLICY "workspaces_select_member"
  ON public.workspaces
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.auth_workspace_ids()));

-- INSERT: via RPC only (no direct INSERT policy for authenticated)
--         Personal workspace created by handle_new_user trigger (Phase 3, migration 0006)
--         Business workspace created by create_business_workspace RPC (migration 0006)

-- UPDATE: admin-only
DROP POLICY IF EXISTS "workspaces_update_admin" ON public.workspaces;
CREATE POLICY "workspaces_update_admin"
  ON public.workspaces
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT workspace_id 
      FROM public.workspace_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    id IN (
      SELECT workspace_id 
      FROM public.workspace_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- DELETE: no policy (workspaces are never deleted in MVP)

-- ---------------------------------------------------------------------------
-- 6. Row-Level Security — workspace_members
-- ---------------------------------------------------------------------------
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- SELECT: member can see fellow members of the same workspace
DROP POLICY IF EXISTS "workspace_members_select_same_workspace" ON public.workspace_members;
CREATE POLICY "workspace_members_select_same_workspace"
  ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (SELECT public.auth_workspace_ids())
  );

-- INSERT: admin-only (for inviting new members)
DROP POLICY IF EXISTS "workspace_members_insert_admin" ON public.workspace_members;
CREATE POLICY "workspace_members_insert_admin"
  ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id 
      FROM public.workspace_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- UPDATE: admin-only (for changing roles)
DROP POLICY IF EXISTS "workspace_members_update_admin" ON public.workspace_members;
CREATE POLICY "workspace_members_update_admin"
  ON public.workspace_members
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM public.workspace_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id 
      FROM public.workspace_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- DELETE: admin-only (for removing members)
DROP POLICY IF EXISTS "workspace_members_delete_admin" ON public.workspace_members;
CREATE POLICY "workspace_members_delete_admin"
  ON public.workspace_members
  FOR DELETE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id 
      FROM public.workspace_members 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Table-level grants
-- ---------------------------------------------------------------------------
GRANT SELECT, UPDATE ON public.workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
