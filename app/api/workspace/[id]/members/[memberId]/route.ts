/**
 * DELETE /api/workspace/[id]/members/[memberId]
 * Remove a member from workspace
 */

import { NextResponse } from "next/server";

import { requireAuth, withErrorHandling } from "@/lib/server/shared/api-helpers";
import { verifyWorkspaceAdmin } from "@/lib/server/shared/workspace-guard";
import { removeMember } from "@/lib/server/workspace/workspace.service";
import { DomainRuleError } from "@/lib/server/shared/errors";
import type { ApiResponse } from "@/types/api";
import { ErrorCode } from "@/types/errors";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const { id: workspaceId, memberId } = await params;

  return withErrorHandling(
    async () => {
      await verifyWorkspaceAdmin(user.id, workspaceId);

      try {
        await removeMember(workspaceId, memberId);
      } catch (err) {
        // RN-17: surface the domain-specific `LAST_ADMIN` code the Roadmap
        // contracts for on this endpoint, rather than the generic
        // DOMAIN_RULE_ERROR code withErrorHandling would otherwise use.
        if (err instanceof DomainRuleError) {
          const body: ApiResponse<never> = {
            data: null,
            error: { code: ErrorCode.LAST_ADMIN, message: err.message },
          };
          return NextResponse.json(body, { status: 422 });
        }
        throw err;
      }

      const responseBody: ApiResponse<{ success: true }> = { data: { success: true }, error: null };
      return NextResponse.json(responseBody, { status: 200 });
    },
    { userId: user.id, workspaceId, memberId, route: "DELETE /api/workspace/[id]/members/[memberId]" },
  );
}
