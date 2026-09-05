import { z } from "zod";

/**
 * Validation schemas for Wallet domain.
 * 
 * Business rules enforced:
 * - name: 1-50 characters (database constraint)
 * - initial_balance: must be integer >= 0 (no negative, no float)
 * - currency: 3-character code (defaults to IDR)
 * - wallet_type: optional, must be 'personal' or 'business' if provided
 */

/**
 * Wallet type enum validation
 */
export const walletTypeSchema = z.enum(["personal", "business"]).nullable();

/**
 * Create wallet schema
 * 
 * Validates wallet creation input:
 * - name: required, 1-50 characters
 * - initial_balance: required, integer >= 0
 * - currency: optional, defaults to 'IDR'
 * - wallet_type: optional
 * - workspace_id: required UUID
 */
export const createWalletSchema = z.object({
  workspace_id: z.string().uuid("workspace_id must be a valid UUID"),
  name: z
    .string()
    .min(1, "Wallet name must be at least 1 character")
    .max(50, "Wallet name must not exceed 50 characters")
    .trim(),
  wallet_type: walletTypeSchema.optional(),
  initial_balance: z
    .number()
    .int("initial_balance must be an integer (no decimal places)")
    .nonnegative("initial_balance must be greater than or equal to 0")
    .safe("initial_balance exceeds safe integer range"),
  currency: z
    .string()
    .length(3, "currency must be a 3-character code")
    .toUpperCase()
    .default("IDR")
    .optional(),
});

/**
 * List wallets query schema
 * 
 * Validates query parameters for wallet listing:
 * - workspace_id: required UUID
 * - include_archived: optional boolean, defaults to false
 */
export const listWalletsQuerySchema = z.object({
  workspace_id: z.string().uuid("workspace_id must be a valid UUID"),
  include_archived: z
    .string()
    .optional()
    .transform((val) => val === "true")
    .pipe(z.boolean())
    .default(false as any), // Transform string query param to boolean
});

/**
 * Archive wallet schema
 * 
 * Validates wallet archive operation:
 * - id: required UUID (wallet to archive)
 * - workspace_id: required UUID (for workspace guard)
 */
export const archiveWalletSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
  workspace_id: z.string().uuid("workspace_id must be a valid UUID"),
});

/**
 * Type inference helpers
 */
export type CreateWalletSchemaType = z.infer<typeof createWalletSchema>;
export type ListWalletsQuerySchemaType = z.infer<typeof listWalletsQuerySchema>;
export type ArchiveWalletSchemaType = z.infer<typeof archiveWalletSchema>;
