/**
 * GET /api/wallet
 * 
 * List wallets for a workspace.
 * 
 * Query parameters:
 * - workspace_id: required
 * - include_archived: optional, defaults to false
 * 
 * Authorization:
 * - Requires authentication
 * - Requires workspace membership (workspace-guard)
 * 
 * Response:
 * - 200: { data: Wallet[] }
 * - 401: Unauthenticated
 * - 404: Workspace not found / not accessible
 */

import { NextResponse } from "next/server";
import { requireAuth, withErrorHandling } from "@/lib/server/shared/api-helpers";
import { verifyWorkspaceMembership } from "@/lib/server/shared/workspace-guard";
import { listWallets, createWallet } from "@/lib/server/wallet/wallet.service";
import { listWalletsQuerySchema, createWalletSchema } from "@/lib/shared/schemas/wallet";
import { ValidationError } from "@/lib/server/shared/errors";
import { childLogger } from "@/lib/server/shared/logger";
import type { ApiResponse } from "@/types/api";
import type { Wallet } from "@/types/wallet";

const log = childLogger("api:wallet");

export async function GET(request: Request) {
  return withErrorHandling(async () => {
    // 1. Authentication
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult;

    // 2. Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const rawQuery = {
      workspace_id: searchParams.get("workspace_id"),
      include_archived: searchParams.get("include_archived"),
    };

    const parseResult = listWalletsQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      log.warn({ errors: parseResult.error.issues }, "GET /api/wallet: validation failed");
      throw new ValidationError("Invalid query parameters", [
        {
          field: parseResult.error.issues[0]?.path[0]?.toString() || "query",
          message: parseResult.error.issues[0]?.message || "Invalid query",
        },
      ]);
    }

    const query = parseResult.data;

    // 3. Workspace authorization
    await verifyWorkspaceMembership(user.id, query.workspace_id);

    // 4. List wallets
    const wallets = await listWallets(query);

    // 5. Success response
    const response: ApiResponse<Wallet[]> = {
      data: wallets,
      error: null,
    };

    return NextResponse.json(response, { status: 200 });
  }, { operation: "GET /api/wallet" });
}

/**
 * POST /api/wallet
 * 
 * Create a new wallet.
 * 
 * Request body:
 * - workspace_id: required
 * - name: required, 1-50 characters
 * - initial_balance: required, integer >= 0
 * - wallet_type: optional, 'personal' or 'business'
 * - currency: optional, defaults to 'IDR'
 * 
 * Authorization:
 * - Requires authentication
 * - Requires workspace membership (workspace-guard)
 * 
 * Response:
 * - 201: { data: Wallet }
 * - 401: Unauthenticated
 * - 404: Workspace not found / not accessible
 * - 422: Validation error
 */
export async function POST(request: Request) {
  return withErrorHandling(async () => {
    // 1. Authentication
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult;

    // 2. Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      log.warn("POST /api/wallet: invalid JSON body");
      throw new ValidationError("Invalid JSON in request body");
    }

    const parseResult = createWalletSchema.safeParse(body);

    if (!parseResult.success) {
      log.warn({ errors: parseResult.error.issues }, "POST /api/wallet: validation failed");

      const fieldErrors = parseResult.error.issues.map((err: any) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      throw new ValidationError("Invalid wallet data", fieldErrors);
    }

    const input = parseResult.data;

    // 3. Workspace authorization
    await verifyWorkspaceMembership(user.id, input.workspace_id);

    // 4. Create wallet
    const wallet = await createWallet(input);

    // 5. Success response
    const response: ApiResponse<Wallet> = {
      data: wallet,
      error: null,
    };

    return NextResponse.json(response, { status: 201 });
  }, { operation: "POST /api/wallet" });
}
