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
 */

import { createServerClient } from '@/lib/server/shared/supabase-server-client';
import {
  NotFoundError,
  ConflictError,
  DomainRuleError,
} from '@/lib/server/shared/errors';
import logger from '@/lib/server/shared/logger';
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryDirection,
} from '@/types/category';

/**
 * List categories for a workspace.
 *
 * @param workspaceId - Workspace ID
 * @param options - Filter options
 * @returns Array of categories
 */
export async function listCategories(
  workspaceId: string,
  options?: {
    direction?: CategoryDirection;
    includeArchived?: boolean;
  },
): Promise<Category[]> {
  const supabase = await createServerClient();

  let query = supabase
    .from('categories')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });

  // Filter by direction if specified
  if (options?.direction) {
    query = query.eq('direction', options.direction);
  }

  // Exclude archived by default
  if (!options?.includeArchived) {
    query = query.eq('archived', false);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('category.service: listCategories failed', {
      workspaceId,
      error: error.message,
    });
    throw new Error('Failed to list categories');
  }

  return (data || []) as Category[];
}

/**
 * Get category by ID.
 * Caller must verify workspace membership before calling this.
 *
 * @param categoryId - Category ID
 * @returns Category object
 * @throws {NotFoundError} If category not found
 */
export async function getCategory(categoryId: string): Promise<Category> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('id', categoryId)
    .single();

  if (error || !data) {
    logger.warn('category.service: category not found', {
      categoryId,
      error: error?.message,
    });
    throw new NotFoundError('Category not found');
  }

  return data as Category;
}

/**
 * Create a custom category.
 * Caller must verify workspace membership before calling this.
 *
 * @param input - Category creation data
 * @returns Created category
 * @throws {ConflictError} If duplicate (workspace_id, name, direction)
 */
export async function createCategory(
  input: CreateCategoryInput,
): Promise<Category> {
  const supabase = await createServerClient();

  // Check for duplicate (same name + direction in same workspace)
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('workspace_id', input.workspace_id)
    .eq('name', input.name)
    .eq('direction', input.direction)
    .eq('archived', false) // archived categories don't block new ones
    .maybeSingle();

  if (existing) {
    throw new ConflictError(
      `Category "${input.name}" already exists as ${input.direction}`,
    );
  }

  // Insert (RLS policy ensures user is workspace member)
  const { data, error } = await supabase
    .from('categories')
    .insert({
      workspace_id: input.workspace_id,
      name: input.name,
      direction: input.direction,
      is_default: false, // custom categories are never default
    })
    .select()
    .single();

  if (error) {
    logger.error('category.service: createCategory failed', {
      workspaceId: input.workspace_id,
      name: input.name,
      error: error.message,
    });

    // Handle unique constraint violation
    if (error.code === '23505') {
      // PostgreSQL unique violation
      throw new ConflictError(
        `Category "${input.name}" already exists as ${input.direction}`,
      );
    }

    throw new Error('Failed to create category');
  }

  logger.info('category.service: category created', {
    categoryId: data.id,
    workspaceId: input.workspace_id,
    name: input.name,
  });

  return data as Category;
}

/**
 * Update category metadata.
 * Currently only name can be updated (direction is immutable).
 *
 * @param categoryId - Category ID
 * @param input - Update data
 * @returns Updated category
 * @throws {NotFoundError} If category not found
 * @throws {ConflictError} If new name conflicts with existing
 */
export async function updateCategory(
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<Category> {
  const supabase = await createServerClient();

  if (!input.name) {
    throw new DomainRuleError('No update data provided');
  }

  // Fetch existing category first
  const existing = await getCategory(categoryId);

  // Check for duplicate name in same workspace + direction
  const { data: duplicate } = await supabase
    .from('categories')
    .select('id')
    .eq('workspace_id', existing.workspace_id)
    .eq('name', input.name)
    .eq('direction', existing.direction)
    .eq('archived', false)
    .neq('id', categoryId) // exclude self
    .maybeSingle();

  if (duplicate) {
    throw new ConflictError(
      `Category "${input.name}" already exists as ${existing.direction}`,
    );
  }

  // Update (RLS policy ensures user is workspace member)
  const { data, error } = await supabase
    .from('categories')
    .update({
      name: input.name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', categoryId)
    .select()
    .single();

  if (error || !data) {
    logger.error('category.service: updateCategory failed', {
      categoryId,
      error: error?.message,
    });
    throw new NotFoundError('Category not found or update failed');
  }

  logger.info('category.service: category updated', {
    categoryId,
    name: input.name,
  });

  return data as Category;
}

/**
 * Archive a category (soft delete).
 * Archived categories are excluded from lists by default.
 *
 * IMPORTANT: Default categories (is_default = true) cannot be archived.
 * Historical transactions retain their category_id even after archiving
 * (ON DELETE RESTRICT + soft delete = safe by construction).
 *
 * @param categoryId - Category ID
 * @throws {NotFoundError} If category not found
 * @throws {DomainRuleError} If trying to archive default category
 */
export async function archiveCategory(categoryId: string): Promise<Category> {
  const supabase = await createServerClient();

  // Fetch existing category first
  const existing = await getCategory(categoryId);

  // Prevent archiving default categories
  if (existing.is_default) {
    throw new DomainRuleError('Cannot archive default categories');
  }

  // Update archived flag (RLS policy ensures user is workspace member)
  const { data, error } = await supabase
    .from('categories')
    .update({
      archived: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', categoryId)
    .select()
    .single();

  if (error || !data) {
    logger.error('category.service: archiveCategory failed', {
      categoryId,
      error: error?.message,
    });
    throw new NotFoundError('Category not found or archive failed');
  }

  logger.info('category.service: category archived', {
    categoryId,
    name: existing.name,
  });

  return data as Category;
}

/**
 * Unarchive a category.
 * Useful if user archived by mistake.
 *
 * @param categoryId - Category ID
 */
export async function unarchiveCategory(
  categoryId: string,
): Promise<Category> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('categories')
    .update({
      archived: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', categoryId)
    .select()
    .single();

  if (error || !data) {
    logger.error('category.service: unarchiveCategory failed', {
      categoryId,
      error: error?.message,
    });
    throw new NotFoundError('Category not found or unarchive failed');
  }

  logger.info('category.service: category unarchived', {
    categoryId,
  });

  return data as Category;
}
