-- =============================================================================
-- Migration: 0007_phase3_security_hardening
-- Description: Close the gaps between what RLS enforces (tenant isolation)
-- and what Phase 3 actually requires (business invariants), so that direct
-- authenticated PostgREST access — bypassing the Next.js app entirely —
-- cannot violate them either.
--
-- RLS in 0004/0005 correctly restricts *which rows* a caller can see or
-- touch (workspace membership). It does NOT restrict *which values* those
-- rows can be mutated to — that requires triggers/constraints, added here.
--
-- This migration is additive on top of already-applied 0004-0006 rather
-- than editing them in place, per the project's migration convention.
--
-- Fixes:
--   1. auth_workspace_ids(): add SET search_path, matching the hardening
--      convention already used by handle_new_user()/create_business_workspace().
--   2. Workspace type immutability (RN-05): a BEFORE UPDATE trigger rejects
--      any change to workspaces.type, at the database layer.
--   3. Last-admin protection (RN-17), UPDATE path: prevent_last_admin_removal
--      only covered DELETE. A new prevent_last_admin_demotion() trigger
--      covers role changes on workspace_members too. Both trigger functions
--      take a per-workspace advisory lock before counting admins, so two
--      concurrent demotions/removals of the workspace's last two admins
--      can't both observe ">=1 admin remaining" and both succeed — one
--      commits, the other re-reads post-commit state and correctly fails.
--   4. Category invariants: workspace_id and is_default become fully
--      immutable after insert, and archiving a still-default category is
--      rejected — closing the path where a caller flips is_default to
--      false first, then archives.
--   5. Fixes a real bug (found by this migration's own test suite, not by
--      inspection): "workspaces_update_admin", "workspace_members_insert_admin",
--      "workspace_members_update_admin", and "workspace_members_delete_admin"
--      (0004) each embed a raw subquery — `SELECT workspace_id FROM
--      workspace_members WHERE user_id = auth.uid() AND role = 'admin'` —
--      directly in their USING/WITH CHECK clause. Three of those four are
--      policies ON workspace_members itself querying workspace_members
--      again, which is the textbook cause of Postgres's "infinite recursion
--      detected in policy for relation" error — every admin-gated mutation
--      on workspace_members (invite, role change, remove) was completely
--      broken. auth_workspace_ids() exists specifically to avoid this (a
--      SECURITY DEFINER function bypasses RLS for its own internal query),
--      but was only ever used for the *membership* check, never the
--      *admin* check — so a second helper, auth_admin_workspace_ids(),
--      is added below and all four policies are redefined to use it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. auth_workspace_ids(): pin search_path
-- ---------------------------------------------------------------------------
-- All identifiers inside were already schema-qualified, so this wasn't
-- exploitable — but every other SECURITY DEFINER function in this schema
-- sets search_path, and this one should too for consistency.
CREATE OR REPLACE FUNCTION public.auth_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 2. Workspace type immutability (RN-05)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_workspace_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type <> OLD.type THEN
    RAISE EXCEPTION 'IMMUTABLE_FIELD: workspace type cannot be changed after creation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_workspace_type_change ON public.workspaces;
CREATE TRIGGER trg_prevent_workspace_type_change
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  WHEN (OLD.type IS DISTINCT FROM NEW.type)
  EXECUTE FUNCTION public.prevent_workspace_type_change();

-- ---------------------------------------------------------------------------
-- 3a. Last-admin protection — DELETE path (concurrency hardening)
-- ---------------------------------------------------------------------------
-- Re-defines the 0006 function to add a per-workspace advisory lock before
-- counting. Without it, two concurrent DELETEs of the workspace's last two
-- admins can each count "1 other admin remaining" from their own snapshot
-- and both succeed, leaving zero admins. The advisory lock forces the two
-- transactions to serialize: whichever commits first is counted correctly
-- by the second.
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_count integer;
BEGIN
  IF OLD.role = 'admin' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(OLD.workspace_id::text, 0));

    SELECT COUNT(*) INTO v_admin_count
    FROM public.workspace_members
    WHERE workspace_id = OLD.workspace_id
      AND role = 'admin'
      AND id <> OLD.id;

    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'LAST_ADMIN: Cannot remove the last admin from workspace';
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

-- Trigger already exists from 0006 (BEFORE DELETE); CREATE OR REPLACE above
-- updates its behavior without needing to touch the trigger definition.

-- ---------------------------------------------------------------------------
-- 3b. Last-admin protection — UPDATE path (new)
-- ---------------------------------------------------------------------------
-- 0006 only blocked *removing* the last admin. Nothing stopped an admin
-- from demoting the last admin (including themselves) to 'member' via
-- UPDATE workspace_members SET role = 'member' — reachable directly via
-- PostgREST regardless of whether the app exposes a role-change route.
-- Uses the SAME advisory lock key as the DELETE trigger so a concurrent
-- delete-vs-demote race on the same workspace also serializes correctly.
CREATE OR REPLACE FUNCTION public.prevent_last_admin_demotion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_count integer;
BEGIN
  IF OLD.role = 'admin' AND NEW.role <> 'admin' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(OLD.workspace_id::text, 0));

    SELECT COUNT(*) INTO v_admin_count
    FROM public.workspace_members
    WHERE workspace_id = OLD.workspace_id
      AND role = 'admin'
      AND id <> OLD.id;

    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'LAST_ADMIN: Cannot demote the last admin of a workspace';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_admin_demotion ON public.workspace_members;
CREATE TRIGGER trg_prevent_last_admin_demotion
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.prevent_last_admin_demotion();

-- ---------------------------------------------------------------------------
-- 4. Category invariants: immutable workspace_id/is_default, protect defaults
-- ---------------------------------------------------------------------------
-- Without this, categories_update_workspace (0005) lets any workspace
-- member flip is_default to false on a seeded category (defeating the
-- "default categories can't be archived" rule) or move a category between
-- two workspaces they belong to by changing workspace_id.
CREATE OR REPLACE FUNCTION public.protect_category_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id <> OLD.workspace_id THEN
    RAISE EXCEPTION 'IMMUTABLE_FIELD: category workspace_id cannot be changed';
  END IF;

  IF NEW.is_default <> OLD.is_default THEN
    RAISE EXCEPTION 'IMMUTABLE_FIELD: category is_default cannot be changed after creation';
  END IF;

  IF OLD.is_default AND NEW.archived AND NOT OLD.archived THEN
    RAISE EXCEPTION 'DEFAULT_CATEGORY: default categories cannot be archived';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_category_invariants ON public.categories;
CREATE TRIGGER trg_protect_category_invariants
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_category_invariants();

-- ---------------------------------------------------------------------------
-- 5. invite_workspace_member() RPC
-- ---------------------------------------------------------------------------
-- Replaces workspace.service.ts's previous (broken) approach of matching
-- user_profiles.id against an email string. auth.users is not exposed over
-- PostgREST (see supabase/config.toml [api].schemas), and email -> user id
-- resolution must never be done with the service-role key from
-- request-scoped app code — so it happens here, in a SECURITY DEFINER
-- function that self-checks the caller is an admin of the target workspace
-- (required since SECURITY DEFINER bypasses RLS entirely, and this RPC is
-- directly callable via PostgREST independent of the app's own
-- verifyWorkspaceAdmin() check).
CREATE OR REPLACE FUNCTION public.invite_workspace_member(
  p_workspace_id uuid,
  p_email text,
  p_role workspace_role
)
RETURNS public.workspace_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_target_user_id uuid;
  v_member public.workspace_members;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = v_caller_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: caller is not an admin of this workspace';
  END IF;

  SELECT id INTO v_target_user_id FROM auth.users WHERE email = p_email LIMIT 1;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: no user exists with that email';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = v_target_user_id
  ) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER: user is already a member of this workspace';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (p_workspace_id, v_target_user_id, p_role)
  RETURNING * INTO v_member;

  RETURN v_member;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_workspace_member(uuid, text, workspace_role) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. service_role table grants
-- ---------------------------------------------------------------------------
-- This Supabase CLI version's local stack does not auto-expose new tables to
-- any Data API role — including service_role — without an explicit GRANT
-- (see supabase/config.toml [api].auto_expose_new_tables). service_role has
-- BYPASSRLS, but that only skips *row-security*; it still needs ordinary
-- table privileges, which 0003/0004/0005 never granted it. Without this,
-- the service-role client (lib/server/shared/supabase-admin-client.ts) — the
-- only client fixture setup/teardown in tests is allowed to use — cannot
-- read or write these tables at all, regardless of RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO service_role;
GRANT SELECT ON public.default_categories_personal TO service_role;
GRANT SELECT ON public.default_categories_business TO service_role;
-- user_profiles is a Phase 2 table with the same gap; granted here (rather
-- than editing the already-applied 0003 migration) since test fixtures in
-- this repair also need service-role read/write access to it.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Fix infinite RLS recursion on workspace_members admin-check policies
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_admin_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = auth.uid() AND role = 'admin';
$$;

GRANT EXECUTE ON FUNCTION public.auth_admin_workspace_ids() TO authenticated;

DROP POLICY IF EXISTS "workspaces_update_admin" ON public.workspaces;
CREATE POLICY "workspaces_update_admin"
  ON public.workspaces
  FOR UPDATE
  TO authenticated
  USING (id IN (SELECT public.auth_admin_workspace_ids()))
  WITH CHECK (id IN (SELECT public.auth_admin_workspace_ids()));

DROP POLICY IF EXISTS "workspace_members_insert_admin" ON public.workspace_members;
CREATE POLICY "workspace_members_insert_admin"
  ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.auth_admin_workspace_ids()));

DROP POLICY IF EXISTS "workspace_members_update_admin" ON public.workspace_members;
CREATE POLICY "workspace_members_update_admin"
  ON public.workspace_members
  FOR UPDATE
  TO authenticated
  USING (workspace_id IN (SELECT public.auth_admin_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.auth_admin_workspace_ids()));

DROP POLICY IF EXISTS "workspace_members_delete_admin" ON public.workspace_members;
CREATE POLICY "workspace_members_delete_admin"
  ON public.workspace_members
  FOR DELETE
  TO authenticated
  USING (workspace_id IN (SELECT public.auth_admin_workspace_ids()));

-- ---------------------------------------------------------------------------
-- 8. Fix listMembers(): PostgREST can't embed workspace_members -> user_profiles
-- ---------------------------------------------------------------------------
-- workspace.service.ts's listMembers() joins user_profiles via PostgREST's
-- embed syntax (`user_profiles:user_id (display_name)`), which requires a
-- real foreign key PostgREST can discover. workspace_members.user_id only
-- had an FK to auth.users — never to user_profiles — so every call to
-- GET /api/workspace/:id/members failed with "Could not find a relationship
-- between 'workspace_members' and 'user_id' in the schema cache" (found by
-- manually exercising the route end-to-end; nothing in the type system or
-- the mocked/RLS test suites would catch a missing PostgREST relationship).
-- Adding this FK is safe: every workspace_members.user_id already has a
-- user_profiles row by construction — handle_new_user() always creates
-- user_profiles before any workspace_members row can exist for that user,
-- and create_business_workspace()/invite_workspace_member() both require an
-- already-authenticated (and therefore already-provisioned) caller/target.
ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;
