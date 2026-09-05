/**
 * wallet.service.ts
 *
 * Business logic for Wallet domain.
 *
 * Key responsibilities:
 * - List wallets (with optional archived inclusion)
 * - Create wallet with initial balance
 * - Archive wallet (soft delete)
 * - Enforce workspace isolation
 * - Validate database results and return proper errors
 *
 * Phase 4 rules:
 * - initial_balance = cached_balance at creation
 * - No transaction ledger writes (Phase 5/6)
 * - No balance recalculation from aggregates
 * - Soft delete only (no hard delete)
 */

import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import { NotFoundError, InternalError } from "@/lib/server/shared/errors";
import { toMoney, type Money } from "@/lib/server/shared/money";
import { childLogger } from "@/lib/server/shared/logger";
import type { Wallet, CreateWalletInput, ListWalletsQuery } from "@/types/wallet";

const log = childLogger("wallet:service");

/**
 * List wallets for a workspace.
 * Default: exclude archived wallets.
 * 
 * @param query - workspace_id and optional include_archived
 * @returns Array of wallets
 */
export async function listWallets(query: ListWalletsQuery): Promise<Wallet[]> {
  const supabase = await createSupabaseServerClient();
  const { workspace_id, include_archived = false } = query;

  log.debug({ workspace_id, include_archived }, "listWallets");

  // Build query with optional archived filter
  let dbQuery = supabase
    .from("wallets")
    .select("*")
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: true });

  // Default behavior: exclude archived
  if (!include_archived) {
    dbQuery = dbQuery.eq("archived", false);
  }

  const { data, error } = await dbQuery;

  if (error) {
    log.error({ workspace_id, error: error.message }, "listWallets: database error");
    throw new InternalError("Failed to list wallets");
  }

  // Convert initial_balance and cached_balance to Money type
  const wallets = (data || []).map((w: any) => ({
    ...w,
    initial_balance: toMoney(w.initial_balance),
    cached_balance: toMoney(w.cached_balance),
  }));

  log.debug({ workspace_id, count: wallets.length }, "listWallets: success");

  return wallets;
}

/**
 * Create a new wallet.
 * 
 * Phase 4 rules:
 * - initial_balance is persisted
 * - cached_balance = initial_balance
 * - No transaction ledger entry created
 * - Returns persisted wallet from database
 * 
 * @param input - Wallet creation data
 * @returns Persisted wallet from database
 * @throws {InternalError} If database operation fails
 */
export async function createWallet(input: CreateWalletInput): Promise<Wallet> {
  const supabase = await createSupabaseServerClient();

  log.debug({ workspace_id: input.workspace_id, name: input.name }, "createWallet");

  // Validate initial_balance and convert to Money
  const initialBalance = toMoney(input.initial_balance);
  const cachedBalance = initialBalance; // Phase 4: cached = initial

  // Prepare wallet data
  const walletData: any = {
    workspace_id: input.workspace_id,
    name: input.name.trim(),
    wallet_type: input.wallet_type || null,
    initial_balance: initialBalance,
    cached_balance: cachedBalance,
    currency: input.currency || "IDR",
    archived: false,
  };

  // Insert wallet and return persisted data
  const { data, error } = await supabase
    .from("wallets")
    .insert(walletData)
    .select()
    .single();

  if (error) {
    log.error(
      {
        workspace_id: input.workspace_id,
        error: error.message,
        code: error.code,
      },
      "createWallet: database error"
    );

    throw new InternalError("Failed to create wallet");
  }

  if (!data) {
    log.error({ workspace_id: input.workspace_id }, "createWallet: no data returned");
    throw new InternalError("Wallet creation did not return persisted data");
  }

  // Convert balance fields to Money
  const wallet: Wallet = {
    ...(data as any),
    initial_balance: toMoney((data as any).initial_balance),
    cached_balance: toMoney((data as any).cached_balance),
  };

  log.info(
    {
      workspace_id: wallet.workspace_id,
      wallet_id: wallet.id,
      name: wallet.name,
    },
    "createWallet: success"
  );

  return wallet;
}

/**
 * Archive a wallet (soft delete).
 * 
 * Rules:
 * - Idempotent: archiving an already-archived wallet succeeds
 * - No hard delete (database has no DELETE policy)
 * - Returns persisted archive state
 * 
 * @param walletId - Wallet ID to archive
 * @param workspaceId - Workspace ID (for verification)
 * @returns Archive result with id and archived flag
 * @throws {NotFoundError} If wallet not found or not accessible
 * @throws {InternalError} If database operation fails
 */
export async function archiveWallet(
  walletId: string,
  workspaceId: string
): Promise<{ id: string; archived: boolean }> {
  const supabase = await createSupabaseServerClient();

  log.debug({ wallet_id: walletId, workspace_id: workspaceId }, "archiveWallet");

  // Update wallet to set archived = true
  const { data, error } = await supabase
    .from("wallets")
    .update({ archived: true } as any)
    .eq("id", walletId)
    .eq("workspace_id", workspaceId)
    .select("id, archived")
    .single();

  if (error) {
    log.error(
      {
        wallet_id: walletId,
        workspace_id: workspaceId,
        error: error.message,
      },
      "archiveWallet: database error"
    );

    // PostgresError code 'PGRST116' means no rows returned
    if (error.code === "PGRST116") {
      throw new NotFoundError("Wallet not found");
    }

    throw new InternalError("Failed to archive wallet");
  }

  if (!data) {
    log.warn({ wallet_id: walletId, workspace_id: workspaceId }, "archiveWallet: wallet not found");
    throw new NotFoundError("Wallet not found");
  }

  log.info(
    {
      wallet_id: (data as any).id,
      workspace_id: workspaceId,
      archived: (data as any).archived,
    },
    "archiveWallet: success"
  );

  return {
    id: (data as any).id,
    archived: (data as any).archived,
  };
}

/**
 * Get a single wallet by ID.
 * 
 * @param walletId - Wallet ID
 * @param workspaceId - Workspace ID (for verification)
 * @returns Wallet
 * @throws {NotFoundError} If wallet not found or not accessible
 */
export async function getWallet(walletId: string, workspaceId: string): Promise<Wallet> {
  const supabase = await createSupabaseServerClient();

  log.debug({ wallet_id: walletId, workspace_id: workspaceId }, "getWallet");

  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("id", walletId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) {
    log.warn({ wallet_id: walletId, workspace_id: workspaceId }, "getWallet: wallet not found");
    throw new NotFoundError("Wallet not found");
  }

  const wallet: Wallet = {
    ...(data as any),
    initial_balance: toMoney((data as any).initial_balance),
    cached_balance: toMoney((data as any).cached_balance),
  };

  return wallet;
}
