/**
 * GET/POST /api/workspace/[id]/members
 * List or invite workspace members
 */

import { NextResponse } from "next/server";

import { requireAuth, withErrorHandling } from "@/lib/server/shared/api-helpers";
import { verifyWorkspaceMembership, verifyWorkspaceAdmin } from "@/lib/server/shared/workspace-guard";
import { listMembers, inviteMember } from "@/lib/server/workspace/workspace.service";
import { inviteMemberSchema } from "@/types/workspace";
import { ValidationError } from "@/lib/server/shared/errors";
import type { ApiResponse } from "@/types/api";
import type { WorkspaceMember } from "@/types/workspace";
import { ErrorCode } from "@/types/errors";

/**
 * GET /api/workspace/[id]/members
 * List all members of workspace
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const { id: workspaceId } = await params;

  return withErrorHandling(
    async () => {
      await verifyWorkspaceMembership(user.id, workspaceId);

      const members = await listMembers(workspaceId);
      const responseBody: ApiResponse<WorkspaceMember[]> = { data: members, error: null };
      return NextResponse.json(responseBody, { status: 200 });
    },
    { userId: user.id, workspaceId, route: "GET /api/workspace/[id]/members" },
  );
}

/**
 * POST /api/workspace/[id]/members
 * Invite a new member (admin only)
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

      const parsed = inviteMemberSchema.safeParse(body);
      if (!parsed.success) {
        const fieldErrors = parsed.error.issues.map((e) => ({
          field: e.path.join(".") || "email",
          message: e.message,
        }));
        throw new ValidationError("Validation failed.", fieldErrors);
      }

      const member = await inviteMember(workspaceId, parsed.data);
      const responseBody: ApiResponse<WorkspaceMember> = { data: member, error: null };
      return NextResponse.json(responseBody, { status: 201 });
    },
    { userId: user.id, workspaceId, route: "POST /api/workspace/[id]/members" },
  );
}
