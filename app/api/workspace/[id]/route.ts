/**
 * GET/PATCH /api/workspace/[id]
 * Get or update workspace by ID
 */

import { NextResponse } from "next/server";

import { requireAuth, withErrorHandling } from "@/lib/server/shared/api-helpers";
import { verifyWorkspaceMembership, verifyWorkspaceAdmin } from "@/lib/server/shared/workspace-guard";
import { getWorkspace, updateWorkspace } from "@/lib/server/workspace/workspace.service";
import { updateWorkspaceSchema } from "@/types/workspace";
import { ValidationError } from "@/lib/server/shared/errors";
import type { ApiResponse } from "@/types/api";
import type { Workspace } from "@/types/workspace";
import { ErrorCode } from "@/types/errors";

/**
 * GET /api/workspace/[id]
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const { id: workspaceId } = await params;

  return withErrorHandling(
    async () => {
      await verifyWorkspaceMembership(user.id, workspaceId);

      const workspace = await getWorkspace(workspaceId);
      const responseBody: ApiResponse<Workspace> = { data: workspace, error: null };
      return NextResponse.json(responseBody, { status: 200 });
    },
    { userId: user.id, workspaceId, route: "GET /api/workspace/[id]" },
  );
}

/**
 * PATCH /api/workspace/[id]
 * Update workspace settings (admin only)
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const { id: workspaceId } = await params;

  return withErrorHandling(
    async () => {
      await verifyWorkspaceAdmin(user.id, workspaceId);

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        const errorBody: ApiResponse<never> = {
          data: null,
          error: { code: ErrorCode.VALIDATION_ERROR, message: "Request body must be valid JSON." },
        };
        return NextResponse.json(errorBody, { status: 400 });
      }

      const parsed = updateWorkspaceSchema.safeParse(body);
      if (!parsed.success) {
        const fieldErrors = parsed.error.issues.map((e) => ({
          field: e.path.join(".") || "name",
          message: e.message,
        }));
        throw new ValidationError("Validation failed.", fieldErrors);
      }

      const workspace = await updateWorkspace(workspaceId, parsed.data);
      const responseBody: ApiResponse<Workspace> = { data: workspace, error: null };
      return NextResponse.json(responseBody, { status: 200 });
    },
    { userId: user.id, workspaceId, route: "PATCH /api/workspace/[id]" },
  );
}
