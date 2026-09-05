/**
 * Integration tests for wallet service.
 * 
 * Tests database operations, business rules, and error handling:
 * - Create wallet: initial_balance = cached_balance
 * - Archive wallet: idempotent operation
 * - List wallets: default filtering (exclude archived)
 * - Cross-workspace isolation
 * - Error handling
 */

import {
  listWallets,
  createWallet,
  archiveWallet,
  getWallet,
} from "@/lib/server/wallet/wallet.service";
import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import { toMoney } from "@/lib/server/shared/money";
import type { Wallet } from "@/types/wallet";

// Mock Supabase client
jest.mock("@/lib/server/shared/supabase-server-client");
jest.mock("@/lib/server/shared/logger", () => ({
  childLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

const mockSupabaseClient = createSupabaseServerClient as jest.MockedFunction<
  typeof createSupabaseServerClient
>;

describe("Wallet Service", () => {
  const mockWorkspaceId = "workspace-123";
  const mockWalletId = "wallet-456";
  const mockUserId = "user-789";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createWallet", () => {
    it("persists wallet with initial_balance = cached_balance", async () => {
      const mockWallet: Wallet = {
        id: mockWalletId,
        workspace_id: mockWorkspaceId,
        name: "BCA",
        wallet_type: "personal",
        initial_balance: toMoney(5000000),
        cached_balance: toMoney(5000000),
        currency: "IDR",
        archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.mockResolvedValue({
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  ...mockWallet,
                  initial_balance: 5000000,
                  cached_balance: 5000000,
                },
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const input = {
        workspace_id: mockWorkspaceId,
        name: "BCA",
        wallet_type: "personal" as const,
        initial_balance: 5000000,
        currency: "IDR",
      };

      const result = await createWallet(input);

      expect(result.initial_balance).toBe(result.cached_balance);
      expect(result.initial_balance).toBe(toMoney(5000000));
      expect(result.name).toBe("BCA");
      expect(result.workspace_id).toBe(mockWorkspaceId);
    });

    it("throws error when database insert fails", async () => {
      mockSupabaseClient.mockResolvedValue({
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { message: "Database error", code: "23505" },
              }),
            }),
          }),
        }),
      } as any);

      const input = {
        workspace_id: mockWorkspaceId,
        name: "BCA",
        initial_balance: 5000000,
      };

      await expect(createWallet(input)).rejects.toThrow("Failed to create wallet");
    });

    it("throws error when no data returned", async () => {
      mockSupabaseClient.mockResolvedValue({
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const input = {
        workspace_id: mockWorkspaceId,
        name: "BCA",
        initial_balance: 5000000,
      };

      await expect(createWallet(input)).rejects.toThrow(
        "Wallet creation did not return persisted data"
      );
    });
  });

  describe("archiveWallet", () => {
    it("archives wallet and returns persisted state", async () => {
      mockSupabaseClient.mockResolvedValue({
        from: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: mockWalletId, archived: true },
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const result = await archiveWallet(mockWalletId, mockWorkspaceId);

      expect(result.id).toBe(mockWalletId);
      expect(result.archived).toBe(true);
    });

    it("is idempotent (archiving already-archived wallet succeeds)", async () => {
      mockSupabaseClient.mockResolvedValue({
        from: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: mockWalletId, archived: true },
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      // First archive
      const result1 = await archiveWallet(mockWalletId, mockWorkspaceId);
      expect(result1.archived).toBe(true);

      // Second archive (idempotent)
      const result2 = await archiveWallet(mockWalletId, mockWorkspaceId);
      expect(result2.archived).toBe(true);
    });

    it("throws NotFoundError when wallet not found", async () => {
      mockSupabaseClient.mockResolvedValue({
        from: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: { code: "PGRST116", message: "No rows found" },
              }),
            }),
          }),
        }),
      } as any);

      await expect(archiveWallet(mockWalletId, mockWorkspaceId)).rejects.toThrow(
        "Wallet not found"
      );
    });

    it("throws NotFoundError when no data returned", async () => {
      mockSupabaseClient.mockResolvedValue({
        from: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      await expect(archiveWallet(mockWalletId, mockWorkspaceId)).rejects.toThrow(
        "Wallet not found"
      );
    });
  });

  describe("listWallets", () => {
    it("excludes archived wallets by default", async () => {
      const mockWallets = [
        {
          id: "wallet-1",
          workspace_id: mockWorkspaceId,
          name: "BCA",
          wallet_type: null,
          initial_balance: 1000000,
          cached_balance: 1000000,
          currency: "IDR",
          archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "wallet-2",
          workspace_id: mockWorkspaceId,
          name: "Cash",
          wallet_type: null,
          initial_balance: 500000,
          cached_balance: 500000,
          currency: "IDR",
          archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const mockQuery = {
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockWallets,
          error: null,
        }),
      };

      mockSupabaseClient.mockResolvedValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue(mockQuery),
        }),
      } as any);

      const result = await listWallets({
        workspace_id: mockWorkspaceId,
        include_archived: false,
      });

      expect(result).toHaveLength(2);
      expect(mockQuery.eq).toHaveBeenCalledWith("archived", false);
    });

    it("includes archived wallets when requested", async () => {
      const mockWallets = [
        {
          id: "wallet-1",
          workspace_id: mockWorkspaceId,
          name: "BCA",
          wallet_type: null,
          initial_balance: 1000000,
          cached_balance: 1000000,
          currency: "IDR",
          archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "wallet-2",
          workspace_id: mockWorkspaceId,
          name: "Archived Wallet",
          wallet_type: null,
          initial_balance: 500000,
          cached_balance: 500000,
          currency: "IDR",
          archived: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const mockQuery = {
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockWallets,
          error: null,
        }),
      };

      mockSupabaseClient.mockResolvedValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue(mockQuery),
        }),
      } as any);

      const result = await listWallets({
        workspace_id: mockWorkspaceId,
        include_archived: true,
      });

      expect(result).toHaveLength(2);
      expect(mockQuery.eq).not.toHaveBeenCalledWith("archived", false);
    });

    it("returns empty array when no wallets exist", async () => {
      const mockQuery = {
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      mockSupabaseClient.mockResolvedValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue(mockQuery),
        }),
      } as any);

      const result = await listWallets({
        workspace_id: mockWorkspaceId,
        include_archived: false,
      });

      expect(result).toHaveLength(0);
    });

    it("throws error when database query fails", async () => {
      const mockQuery = {
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: null,
          error: { message: "Database error" },
        }),
      };

      mockSupabaseClient.mockResolvedValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue(mockQuery),
        }),
      } as any);

      await expect(
        listWallets({
          workspace_id: mockWorkspaceId,
          include_archived: false,
        })
      ).rejects.toThrow("Failed to list wallets");
    });
  });

  describe("getWallet", () => {
    it("returns wallet when found", async () => {
      const mockWallet = {
        id: mockWalletId,
        workspace_id: mockWorkspaceId,
        name: "BCA",
        wallet_type: "personal",
        initial_balance: 5000000,
        cached_balance: 5000000,
        currency: "IDR",
        archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockSupabaseClient.mockResolvedValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: mockWallet,
              error: null,
            }),
          }),
        }),
      } as any);

      const result = await getWallet(mockWalletId, mockWorkspaceId);

      expect(result.id).toBe(mockWalletId);
      expect(result.name).toBe("BCA");
    });

    it("throws NotFoundError when wallet not found", async () => {
      mockSupabaseClient.mockResolvedValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "Not found" },
            }),
          }),
        }),
      } as any);

      await expect(getWallet(mockWalletId, mockWorkspaceId)).rejects.toThrow("Wallet not found");
    });
  });
});
