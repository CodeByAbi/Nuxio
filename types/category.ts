/**
 * Category types and schemas
 * Shared between frontend and backend
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Database enums (must match migration 0005_category.sql)
// ---------------------------------------------------------------------------
export const CategoryDirection = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;

export type CategoryDirection =
  (typeof CategoryDirection)[keyof typeof CategoryDirection];

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------
export interface Category {
  id: string;
  workspace_id: string;
  name: string;
  direction: CategoryDirection;
  is_default: boolean; // true if seeded from default_categories_*
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface DefaultCategory {
  id: number;
  name: string;
  direction: CategoryDirection;
}

// ---------------------------------------------------------------------------
// Zod schemas (validation)
// ---------------------------------------------------------------------------

/**
 * Schema for creating a custom category.
 * Default categories are seeded automatically during workspace creation.
 */
export const createCategorySchema = z.object({
  workspace_id: z.string().uuid('Invalid workspace ID'),
  name: z
    .string()
    .min(1, 'Category name is required')
    .max(30, 'Category name must be at most 30 characters')
    .trim(),
  direction: z.enum([CategoryDirection.INCOME, CategoryDirection.EXPENSE]),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/**
 * Schema for updating a category.
 * Currently only name can be updated (direction is immutable).
 */
export const updateCategorySchema = z.object({
  name: z
    .string()
    .min(1, 'Category name is required')
    .max(30, 'Category name must be at most 30 characters')
    .trim()
    .optional(),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
