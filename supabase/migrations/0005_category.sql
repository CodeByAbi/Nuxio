-- =============================================================================
-- Migration: 0005_category
-- Description: categories table + default category seed tables
--
-- Categories are workspace-scoped (every workspace has its own set).
-- Default categories are seeded from reference tables when:
--   - Personal workspace created: seeds from default_categories_personal
--   - Business workspace created: seeds from default_categories_business
--
-- These seed tables are NOT workspace-scoped — they're static reference data
-- read once during workspace creation.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE category_direction AS ENUM ('income', 'expense');

-- ---------------------------------------------------------------------------
-- 2. categories table (workspace-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id           uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid             NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  name         varchar(30)      NOT NULL,
  direction    category_direction NOT NULL,
  is_default   boolean          NOT NULL DEFAULT false,
  archived     boolean          NOT NULL DEFAULT false,
  created_at   timestamptz      NOT NULL DEFAULT now(),
  updated_at   timestamptz      NOT NULL DEFAULT now()
);

-- Unique constraint: (workspace_id, name, direction) WHERE NOT archived
-- Allows same name to be reused after archiving
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique_name_per_workspace
  ON public.categories(workspace_id, name, direction)
  WHERE NOT archived;

-- Trigger: auto-update updated_at
DROP TRIGGER IF EXISTS trg_categories_set_updated_at ON public.categories;
CREATE TRIGGER trg_categories_set_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Seed tables (static reference data, NOT workspace-scoped)
-- ---------------------------------------------------------------------------

-- Default categories for Personal workspaces
CREATE TABLE IF NOT EXISTS public.default_categories_personal (
  id        serial PRIMARY KEY,
  name      varchar(30) NOT NULL,
  direction category_direction NOT NULL
);

-- Default categories for Business workspaces
CREATE TABLE IF NOT EXISTS public.default_categories_business (
  id        serial PRIMARY KEY,
  name      varchar(30) NOT NULL,
  direction category_direction NOT NULL
);

-- ---------------------------------------------------------------------------
-- 4. Seed data — Personal workspace categories
-- ---------------------------------------------------------------------------
INSERT INTO public.default_categories_personal (name, direction) VALUES
  -- Income categories
  ('Gaji', 'income'),
  ('Bonus', 'income'),
  ('Investasi', 'income'),
  ('Lain-lain', 'income'),
  
  -- Expense categories
  ('Makanan & Minuman', 'expense'),
  ('Transportasi', 'expense'),
  ('Belanja', 'expense'),
  ('Tagihan', 'expense'),
  ('Hiburan', 'expense'),
  ('Kesehatan', 'expense'),
  ('Pendidikan', 'expense'),
  ('Lain-lain', 'expense')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Seed data — Business workspace categories
-- ---------------------------------------------------------------------------
INSERT INTO public.default_categories_business (name, direction) VALUES
  -- Income categories
  ('Penjualan', 'income'),
  ('Jasa', 'income'),
  ('Investasi', 'income'),
  ('Lain-lain', 'income'),
  
  -- Expense categories
  ('Gaji Karyawan', 'expense'),
  ('Operasional', 'expense'),
  ('Marketing', 'expense'),
  ('Sewa', 'expense'),
  ('Utilitas', 'expense'),
  ('Perlengkapan', 'expense'),
  ('Perjalanan Dinas', 'expense'),
  ('Lain-lain', 'expense')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Row-Level Security — categories
-- ---------------------------------------------------------------------------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- SELECT: members can see categories in their workspace
DROP POLICY IF EXISTS "categories_select_workspace" ON public.categories;
CREATE POLICY "categories_select_workspace"
  ON public.categories
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT public.auth_workspace_ids()));

-- INSERT: members can create custom categories
DROP POLICY IF EXISTS "categories_insert_workspace" ON public.categories;
CREATE POLICY "categories_insert_workspace"
  ON public.categories
  FOR INSERT
  TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.auth_workspace_ids()));

-- UPDATE: members can update (archive) categories
DROP POLICY IF EXISTS "categories_update_workspace" ON public.categories;
CREATE POLICY "categories_update_workspace"
  ON public.categories
  FOR UPDATE
  TO authenticated
  USING (workspace_id IN (SELECT public.auth_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.auth_workspace_ids()));

-- DELETE: no policy (categories are soft-deleted via archived flag)

-- ---------------------------------------------------------------------------
-- 7. Row-Level Security — seed tables
-- ---------------------------------------------------------------------------
-- Seed tables are read-only reference data, readable by authenticated users
-- (needed for UI that shows available default categories before workspace creation)
ALTER TABLE public.default_categories_personal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.default_categories_business ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "default_categories_personal_select_all" ON public.default_categories_personal;
CREATE POLICY "default_categories_personal_select_all"
  ON public.default_categories_personal
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "default_categories_business_select_all" ON public.default_categories_business;
CREATE POLICY "default_categories_business_select_all"
  ON public.default_categories_business
  FOR SELECT
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 8. Table-level grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.categories TO authenticated;
GRANT SELECT ON public.default_categories_personal TO authenticated;
GRANT SELECT ON public.default_categories_business TO authenticated;
