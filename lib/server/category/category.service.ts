/**
 * category.service.ts
 *
 * Business logic for Category domain.
 *
 * Key responsibilities:
 * - List categories for a workspace (filter by direction, include/exclude archived)
 * - Create custom categories
 * - Archive categories (soft delete only — no hard delete)
 * - Categories are workspace-scoped via RLS
 *
 * `is_default`, `workspace_id`, and the archive-default-category rule are
 * also enforced at the database layer (migration 0007's
 * `trg_protect_category_invariants` trigger) — the checks here exist for
 * friendly error messages, not as the only line of defense.
 */

import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import { NotFoundError, ConflictError, DomainRuleError } from "@/lib/server/shared/errors";
import { childLogger } from "@/lib/server/shared/logger";
import type { Category, CreateCategoryInput, UpdateCategoryInput, CategoryDirection } from "@/types/category";

const log = childLogger("category-service");

/**
 * List categories for a workspace.
 */
export async function listCategories(
  workspaceId: string,
  options?: {
    direction?: CategoryDirection;
    includeArchived?: boolean;
  },
): Promise<Category[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("categories")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (options?.direction) {
    query = query.eq("direction", options.direction);
  }

  if (!options?.includeArchived) {
    query = query.eq("archived", false);
  }

  const { data, error } = await query;

  if (error) {
    log.error({ workspaceId, err: error.message }, "listCategories failed");
    throw new Error("Failed to list categories");
  }

  return (data ?? []) as Category[];
}

/**
 * Get category by ID.
 * Caller must verify workspace membership before calling this.
 *
 * @throws {NotFoundError} If category not found
 */
export async function getCategory(categoryId: string): Promise<Category> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from("categories").select("*").eq("id", categoryId).single();

  if (error || !data) {
    log.warn({ categoryId, err: error?.message }, "category not found");
    throw new NotFoundError("Category not found");
  }

  return data as Category;
}

/**
 * Create a custom category.
 * Caller must verify workspace membership before calling this.
 *
 * @throws {ConflictError} If duplicate (workspace_id, name, direction)
 */
export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("workspace_id", input.workspace_id)
    .eq("name", input.name)
    .eq("direction", input.direction)
    .eq("archived", false)
    .maybeSingle();

  if (existing) {
    throw new ConflictError(`Category "${input.name}" already exists as ${input.direction}`);
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({
      workspace_id: input.workspace_id,
      name: input.name,
      direction: input.direction,
      is_default: false, // custom categories are never default
    })
    .select()
    .single();

  if (error) {
    log.error({ workspaceId: input.workspace_id, name: input.name, err: error.message }, "createCategory failed");

    if (error.code === "23505") {
      // Unique constraint race: another request created the same
      // (workspace_id, name, direction) between our check and our insert.
      throw new ConflictError(`Category "${input.name}" already exists as ${input.direction}`);
    }

    throw new Error("Failed to create category");
  }

  log.info({ categoryId: data.id, workspaceId: input.workspace_id, name: input.name }, "category created");

  return data as Category;
}

/**
 * Update category metadata.
 * Currently only name can be updated (direction is immutable).
 *
 * @throws {NotFoundError} If category not found
 * @throws {ConflictError} If new name conflicts with existing
 */
export async function updateCategory(categoryId: string, input: UpdateCategoryInput): Promise<Category> {
  const supabase = await createSupabaseServerClient();

  if (!input.name) {
    throw new DomainRuleError("No update data provided");
  }

  const existing = await getCategory(categoryId);

  const { data: duplicate } = await supabase
    .from("categories")
    .select("id")
    .eq("workspace_id", existing.workspace_id)
    .eq("name", input.name)
    .eq("direction", existing.direction)
    .eq("archived", false)
    .neq("id", categoryId)
    .maybeSingle();

  if (duplicate) {
    throw new ConflictError(`Category "${input.name}" already exists as ${existing.direction}`);
  }

  const { data, error } = await supabase
    .from("categories")
    .update({
      name: input.name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", categoryId)
    .select()
    .single();

  if (error || !data) {
    log.error({ categoryId, err: error?.message }, "updateCategory failed");
    throw new NotFoundError("Category not found or update failed");
  }

  log.info({ categoryId, name: input.name }, "category updated");

  return data as Category;
}

/**
 * Archive a category (soft delete).
 * Archived categories are excluded from lists by default.
 *
 * IMPORTANT: Default categories (is_default = true) cannot be archived —
 * enforced here for a friendly error, and again at the database layer by
 * `trg_protect_category_invariants` (migration 0007) if this check is
 * bypassed via direct PostgREST access.
 *
 * @throws {NotFoundError} If category not found
 * @throws {DomainRuleError} If trying to archive a default category
 */
export async function archiveCategory(categoryId: string): Promise<Category> {
  const supabase = await createSupabaseServerClient();

  const existing = await getCategory(categoryId);

  if (existing.is_default) {
    throw new DomainRuleError("Cannot archive default categories");
  }

  const { data, error } = await supabase
    .from("categories")
    .update({
      archived: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", categoryId)
    .select()
    .single();

  if (error) {
    if (error.message.includes("DEFAULT_CATEGORY")) {
      throw new DomainRuleError("Cannot archive default categories");
    }
    log.error({ categoryId, err: error.message }, "archiveCategory failed");
    throw new NotFoundError("Category not found or archive failed");
  }

  if (!data) {
    throw new NotFoundError("Category not found or archive failed");
  }

  log.info({ categoryId, name: existing.name }, "category archived");

  return data as Category;
}

/**
 * Unarchive a category.
 */
export async function unarchiveCategory(categoryId: string): Promise<Category> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("categories")
    .update({
      archived: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", categoryId)
    .select()
    .single();

  if (error || !data) {
    log.error({ categoryId, err: error?.message }, "unarchiveCategory failed");
    throw new NotFoundError("Category not found or unarchive failed");
  }

  log.info({ categoryId }, "category unarchived");

  return data as Category;
}
