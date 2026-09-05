import type { Money } from "@/lib/server/shared/money";

/**
 * Wallet type enum - optional label for wallet categorization.
 * Primarily relevant in Business workspace (FR-029).
 * Does not affect balance calculations.
 */
export type WalletType = "personal" | "business";

/**
 * Wallet - represents a source of funds (Cash/Bank/E-Wallet).
 * 
 * Business rules:
 * - initial_balance: persisted once at creation, immutable
 * - cached_balance: derived data, initially = initial_balance
 *   (mutated atomically by applyLedgerMovement in Phase 5/6)
 * - Soft delete via archived flag (FR-023)
 * - Archived wallets reject new transactions (FR-023)
 */
export interface Wallet {
  id: string;
  workspace_id: string;
  name: string;
  wallet_type: WalletType | null;
  initial_balance: Money;
  cached_balance: Money;
  currency: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Input for creating a new wallet.
 * Phase 4: initial_balance is persisted, cached_balance set equal to it.
 */
export interface CreateWalletInput {
  workspace_id: string;
  name: string;
  wallet_type?: WalletType | null;
  initial_balance: number; // Will be converted to Money after validation
  currency?: string;
}

/**
 * Input for archiving a wallet.
 * Archive is idempotent - archiving an already-archived wallet succeeds.
 */
export interface ArchiveWalletInput {
  id: string;
  workspace_id: string;
}

/**
 * Query parameters for listing wallets.
 * Default behavior: archived = false (exclude archived wallets).
 */
export interface ListWalletsQuery {
  workspace_id: string;
  include_archived?: boolean;
}

/**
 * Result of wallet listing.
 */
export interface ListWalletsResult {
  wallets: Wallet[];
}

/**
 * Result of wallet creation (returns persisted wallet from database).
 */
export interface CreateWalletResult {
  wallet: Wallet;
}

/**
 * Result of wallet archive (returns updated wallet state from database).
 */
export interface ArchiveWalletResult {
  id: string;
  archived: boolean;
}
