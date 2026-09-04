/**
 * POST /api/workspace
 * Create a new Business workspace
 */

import { NextResponse } from "next/server";

import { requireAuth, withErrorHandling } from "@/lib/server/shared/api-helpers";
import { createBusinessWorkspace } from "@/lib/server/workspace/workspace.service";
import { createWorkspaceSchema } from "@/types/workspace";
import { ValidationError } from "@/lib/server/shared/errors";
import type { ApiResponse } from "@/types/api";
import type { Workspace } from "@/types/workspace";
import { ErrorCode } from "@/types/errors";

export async function POST(request: Request) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  return withErrorHandling(
    async () => {
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

      const parsed = createWorkspaceSchema.safeParse(body);
      if (!parsed.success) {
        const fieldErrors = parsed.error.issues.map((e) => ({
          field: e.path.join(".") || "name",
          message: e.message,
        }));
        throw new ValidationError("Validation failed.", fieldErrors);
      }

      const workspace = await createBusinessWorkspace(user.id, parsed.data);
      const responseBody: ApiResponse<Workspace> = { data: workspace, error: null };
      return NextResponse.json(responseBody, { status: 201 });
    },
    { userId: user.id, route: "POST /api/workspace" },
  );
}
