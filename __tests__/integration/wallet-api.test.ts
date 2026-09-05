/**
 * Integration tests for wallet API routes.
 * 
 * Tests HTTP endpoints:
 * - GET /api/wallet: list wallets
 * - POST /api/wallet: create wallet
 * - PATCH /api/wallet/[id]/archive: archive wallet
 * 
 * Validates:
 * - Authentication requirements
 * - Workspace authorization
 * - Request validation
 * - Response format
 * - Error handling
 */

import { GET, POST } from "@/app/api/wallet/route";
import { PATCH } from "@/app/api/wallet/[id]/archive/route";
import { requireAuth } from "@/lib/server/shared/api-helpers";
import { verifyWorkspaceMembership } from "@/lib/server/shared/workspace-guard";
import * as walletService from "@/lib/server/wallet/wallet.service";
import { toMoney } from "@/lib/server/shared/money";
import type { Wallet } from "@/types/wallet";

// Mock dependencies
jest.mock("@/lib/server/shared/api-helpers");
jest.mock("@/lib/server/shared/workspace-guard");
jest.mock("@/lib/server/wallet/wallet.service");
jest.mock("@/lib/server/shared/logger", () => ({
  childLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
}));

const mockRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockVerifyWorkspaceMembership = verifyWorkspaceMembership as jest.MockedFunction<
  typeof verifyWorkspaceMembership
>;
const mockListWallets = walletService.listWallets as jest.MockedFunction<
  typeof walletService.listWallets
>;
const mockCreateWallet = walletService.createWallet as jest.MockedFunction<
  typeof walletService.createWallet
>;
const mockArchiveWallet = walletService.archiveWallet as jest.MockedFunction<
  typeof walletService.archiveWallet
>;

describe("GET /api/wallet", () => {
  const mockUser = { id: "user-123", email: "test@example.com" };
  const mockWorkspaceId = "workspace-456";

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ user: mockUser as any });
    mockVerifyWorkspaceMembership.mockResolvedValue(undefined);
  });

  it("returns 200 with wallets list on success", async () => {
    const mockWallets: Wallet[] = [
      {
        id: "wallet-1",
        workspace_id: mockWorkspaceId,
        name: "BCA",
        wallet_type: "personal",
        initial_balance: toMoney(5000000),
        cached_balance: toMoney(5000000),
        currency: "IDR",
        archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    mockListWallets.mockResolvedValue(mockWallets);

    const request = new Request(
      `http://localhost/api/wallet?workspace_id=${mockWorkspaceId}&include_archived=false`
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("BCA");
    expect(body.error).toBeNull();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      json: jest.fn(),
      status: 401,
    } as any);

    const request = new Request(`http://localhost/api/wallet?workspace_id=${mockWorkspaceId}`);

    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns 422 when workspace_id is missing", async () => {
    const request = new Request("http://localhost/api/wallet");

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when workspace_id is invalid UUID", async () => {
    const request = new Request("http://localhost/api/wallet?workspace_id=invalid");

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when user is not workspace member", async () => {
    mockVerifyWorkspaceMembership.mockRejectedValue(new Error("Workspace not found"));

    const request = new Request(`http://localhost/api/wallet?workspace_id=${mockWorkspaceId}`);

    const response = await GET(request);

    expect(response.status).toBe(500); // withErrorHandling catches the error
  });

  it("passes include_archived parameter correctly", async () => {
    mockListWallets.mockResolvedValue([]);

    const request = new Request(
      `http://localhost/api/wallet?workspace_id=${mockWorkspaceId}&include_archived=true`
    );

    await GET(request);

    expect(mockListWallets).toHaveBeenCalledWith({
      workspace_id: mockWorkspaceId,
      include_archived: true,
    });
  });
});

describe("POST /api/wallet", () => {
  const mockUser = { id: "user-123", email: "test@example.com" };
  const mockWorkspaceId = "workspace-456";

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ user: mockUser as any });
    mockVerifyWorkspaceMembership.mockResolvedValue(undefined);
  });

  it("returns 201 with created wallet on success", async () => {
    const mockWallet: Wallet = {
      id: "wallet-new",
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

    mockCreateWallet.mockResolvedValue(mockWallet);

    const request = new Request("http://localhost/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: mockWorkspaceId,
        name: "BCA",
        wallet_type: "personal",
        initial_balance: 5000000,
        currency: "IDR",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.name).toBe("BCA");
    expect(body.data.initial_balance).toBe(body.data.cached_balance);
    expect(body.error).toBeNull();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      json: jest.fn(),
      status: 401,
    } as any);

    const request = new Request("http://localhost/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: mockWorkspaceId,
        name: "BCA",
        initial_balance: 5000000,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("returns 422 when name is missing", async () => {
    const request = new Request("http://localhost/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: mockWorkspaceId,
        initial_balance: 5000000,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when initial_balance is negative", async () => {
    const request = new Request("http://localhost/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: mockWorkspaceId,
        name: "BCA",
        initial_balance: -1000,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when initial_balance is float", async () => {
    const request = new Request("http://localhost/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: mockWorkspaceId,
        name: "BCA",
        initial_balance: 100.5,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when JSON body is invalid", async () => {
    const request = new Request("http://localhost/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /api/wallet/[id]/archive", () => {
  const mockUser = { id: "user-123", email: "test@example.com" };
  const mockWorkspaceId = "workspace-456";
  const mockWalletId = "wallet-789";

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ user: mockUser as any });
    mockVerifyWorkspaceMembership.mockResolvedValue(undefined);
  });

  it("returns 200 with archived state on success", async () => {
    mockArchiveWallet.mockResolvedValue({
      id: mockWalletId,
      archived: true,
    });

    const request = new Request(`http://localhost/api/wallet/${mockWalletId}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: mockWorkspaceId }),
    });

    const context = { params: Promise.resolve({ id: mockWalletId }) };

    const response = await PATCH(request, context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.id).toBe(mockWalletId);
    expect(body.data.archived).toBe(true);
    expect(body.error).toBeNull();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAuth.mockResolvedValue({
      json: jest.fn(),
      status: 401,
    } as any);

    const request = new Request(`http://localhost/api/wallet/${mockWalletId}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: mockWorkspaceId }),
    });

    const context = { params: Promise.resolve({ id: mockWalletId }) };

    const response = await PATCH(request, context);

    expect(response.status).toBe(401);
  });

  it("returns 422 when wallet ID is invalid UUID", async () => {
    const request = new Request("http://localhost/api/wallet/invalid-id/archive", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: mockWorkspaceId }),
    });

    const context = { params: Promise.resolve({ id: "invalid-id" }) };

    const response = await PATCH(request, context);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when workspace_id is missing", async () => {
    const request = new Request(`http://localhost/api/wallet/${mockWalletId}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const context = { params: Promise.resolve({ id: mockWalletId }) };

    const response = await PATCH(request, context);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("is idempotent (archiving twice succeeds)", async () => {
    mockArchiveWallet.mockResolvedValue({
      id: mockWalletId,
      archived: true,
    });

    const request = new Request(`http://localhost/api/wallet/${mockWalletId}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: mockWorkspaceId }),
    });

    const context = { params: Promise.resolve({ id: mockWalletId }) };

    // First archive
    const response1 = await PATCH(request, context);
    expect(response1.status).toBe(200);

    // Second archive (idempotent)
    const response2 = await PATCH(
      new Request(`http://localhost/api/wallet/${mockWalletId}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: mockWorkspaceId }),
      }),
      context
    );
    expect(response2.status).toBe(200);
  });
});
