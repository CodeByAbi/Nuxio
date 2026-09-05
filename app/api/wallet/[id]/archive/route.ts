/**
 * PATCH /api/wallet/[id]/archive
 * 
 * Archive a wallet (soft delete).
 * 
 * Path parameters:
 * - id: wallet ID
 * 
 * Request body:
 * - workspace_id: required (for workspace guard)
 * 
 * Authorization:
 * - Requires authentication
 * - Requires workspace membership (workspace-guard)
 * 
 * Business rules:
 * - Idempotent: archiving an already-archived wallet succeeds
 * - No hard delete (database has no DELETE policy)
 * - Archived wallets reject new transactions (validated in Phase 5/6)
 * 
 * Response:
 * - 200: { data: { id, archived } }
 * - 401: Unauthenticated
 * - 404: Wallet not found / not accessible
 * - 422: Validation error
 */

import { NextResponse } from "next/server";
import { requireAuth, withErrorHandling } from "@/lib/server/shared/api-helpers";
import { verifyWorkspaceMembership } from "@/lib/server/shared/workspace-guard";
import { archiveWallet } from "@/lib/server/wallet/wallet.service";
import { ValidationError } from "@/lib/server/shared/errors";
import { childLogger } from "@/lib/server/shared/logger";
import type { ApiResponse } from "@/types/api";
import { z } from "zod";

const log = childLogger("api:wallet:archive");

// Schema for archive request body
const archiveRequestSchema = z.object({
  workspace_id: z.string().uuid("workspace_id must be a valid UUID"),
});

// Context type for route params in Next.js 16
interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  return withErrorHandling(async () => {
    // 1. Authentication
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult;

    // 2. Get wallet ID from path params (Next.js 16 async params)
    const params = await context.params;
    const walletId = params.id;

    // Validate wallet ID is UUID
    const uuidSchema = z.string().uuid();
    if (!uuidSchema.safeParse(walletId).success) {
      log.warn({ walletId }, "PATCH archive: invalid wallet ID");
      throw new ValidationError("Invalid wallet ID");
    }

    // 3. Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      log.warn("PATCH archive: invalid JSON body");
      throw new ValidationError("Invalid JSON in request body");
    }

    const parseResult = archiveRequestSchema.safeParse(body);
    if (!parseResult.success) {
      log.warn({ errors: parseResult.error.issues }, "PATCH archive: validation failed");

      const fieldErrors = parseResult.error.issues.map((err: any) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      throw new ValidationError("Invalid request data", fieldErrors);
    }

    const { workspace_id } = parseResult.data;

    // 4. Workspace authorization
    await verifyWorkspaceMembership(user.id, workspace_id);

    // 5. Archive wallet
    const result = await archiveWallet(walletId, workspace_id);

    // 6. Success response
    const response: ApiResponse<{ id: string; archived: boolean }> = {
      data: result,
      error: null,
    };

    return NextResponse.json(response, { status: 200 });
  }, { operation: "PATCH /api/wallet/:id/archive", walletId: (await context.params).id });
}
