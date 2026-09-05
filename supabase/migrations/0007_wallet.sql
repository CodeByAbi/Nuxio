-- =============================================================================
-- Migration: 0007_wallet
-- Description: wallets table + wallet_type enum + RLS + applyLedgerMovement stub
--
-- Phase 4: Wallet creation, listing, archiving. Initial balance persistence.
--
-- Key characteristics:
--   - wallet_type: personal/business (nullable, optional label)
--   - initial_balance: persisted once at creation, immutable
--   - cached_balance: derived data, initially = initial_balance
--       (mutated atomically by applyLedgerMovement RPC in Phase 5/6)
--   - Soft delete via archived flag (FR-023)
--   - NO DELETE POLICY — hard delete is structurally rejected
--   - Composite unique key (id, workspace_id) required for Phase 6 Transfer FK
--   - Workspace isolation via RLS + workspace-guard
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE wallet_type AS ENUM ('personal', 'business');

-- ---------------------------------------------------------------------------
-- 2. wallets table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  name            varchar(50) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  wallet_type     wallet_type NULL,
  initial_balance bigint      NOT NULL DEFAULT 0 CHECK (initial_balance >= 0),
  cached_balance  bigint      NOT NULL DEFAULT 0,
  currency        char(3)     NOT NULL DEFAULT 'IDR',
  archived        boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Composite unique key: required for Phase 6 Transfer composite FK
-- Ensures (id, workspace_id) uniqueness for foreign key references
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_unique_id_workspace
  ON public.wallets(id, workspace_id);

-- Index: improve workspace queries (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_wallets_workspace_id
  ON public.wallets(workspace_id);

-- Index: improve archived filtering (default queries exclude archived)
CREATE INDEX IF NOT EXISTS idx_wallets_workspace_archived
  ON public.wallets(workspace_id, archived);

-- Trigger: auto-update updated_at
DROP TRIGGER IF EXISTS trg_wallets_set_updated_at ON public.wallets;
CREATE TRIGGER trg_wallets_set_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Row-Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- SELECT: members can see wallets in their workspace
DROP POLICY IF EXISTS "wallets_select_workspace" ON public.wallets;
CREATE POLICY "wallets_select_workspace"
  ON public.wallets
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT public.auth_workspace_ids()));

-- INSERT: members can create wallets
DROP POLICY IF EXISTS "wallets_insert_workspace" ON public.wallets;
CREATE POLICY "wallets_insert_workspace"
  ON public.wallets
  FOR INSERT
  TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.auth_workspace_ids()));

-- UPDATE: members can update (primarily for archive)
-- Note: cached_balance updates via applyLedgerMovement RPC only (Phase 5/6)
DROP POLICY IF EXISTS "wallets_update_workspace" ON public.wallets;
CREATE POLICY "wallets_update_workspace"
  ON public.wallets
  FOR UPDATE
  TO authenticated
  USING (workspace_id IN (SELECT public.auth_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.auth_workspace_ids()));

-- DELETE: no policy (wallets are soft-deleted via archived flag)
-- Hard delete is structurally rejected by RLS

-- ---------------------------------------------------------------------------
-- 4. Table-level grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.wallets TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. applyLedgerMovement function (stub for Phase 5/6)
-- ---------------------------------------------------------------------------
-- This function will atomically update cached_balance when transactions/transfers
-- are created/updated/deleted. Phase 4 does NOT call this function — it exists
-- as internal infrastructure for Phase 5/6 ledger operations.
--
-- SECURITY: SECURITY DEFINER so it can update cached_balance even when called
-- from service role context (background jobs). Caller must validate workspace_id.
--
-- Phase 4 behavior: Stub returns success without mutation (wallet balance only
-- changes at creation via initial_balance).
CREATE OR REPLACE FUNCTION public.apply_ledger_movement(
  p_wallet_id uuid,
  p_amount bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Phase 4 stub: no-op
  -- Phase 5/6 will implement:
  --   UPDATE wallets
  --   SET cached_balance = cached_balance + p_amount
  --   WHERE id = p_wallet_id;
  --
  --   IF NOT FOUND THEN
  --     RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
  --   END IF;
  
  -- For now, do nothing
  RETURN;
END;
$$;

-- Grant execute to authenticated users (called by transaction/transfer RPCs)
GRANT EXECUTE ON FUNCTION public.apply_ledger_movement(uuid, bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- Comments for documentation
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.wallets IS 
  'Phase 4: Wallet domain. Source of funds with cached balance derived from ledger.';

COMMENT ON COLUMN public.wallets.initial_balance IS 
  'Initial balance persisted at creation. Immutable. cached_balance starts equal to this.';

COMMENT ON COLUMN public.wallets.cached_balance IS 
  'Derived data: sum of initial_balance + all ledger movements. Updated atomically by apply_ledger_movement RPC.';

COMMENT ON COLUMN public.wallets.wallet_type IS 
  'Optional label (personal/business). Primarily relevant in Business workspace. Does not affect balance calculations.';

COMMENT ON COLUMN public.wallets.archived IS 
  'Soft delete flag. Archived wallets reject new transactions (validated in create_transaction/create_transfer RPCs).';

COMMENT ON FUNCTION public.apply_ledger_movement(uuid, bigint) IS 
  'Phase 5/6: Atomically update wallet cached_balance. Phase 4: stub (no-op).';
