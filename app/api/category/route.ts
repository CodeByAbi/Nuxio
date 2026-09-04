/**
 * GET/POST /api/category
 * List or create categories
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { requireAuth, withErrorHandling } from "@/lib/server/shared/api-helpers";
import { verifyWorkspaceMembership } from "@/lib/server/shared/workspace-guard";
import { listCategories, createCategory } from "@/lib/server/category/category.service";
import { createCategorySchema } from "@/types/category";
import type { CategoryDirection } from "@/types/category";
import { ValidationError } from "@/lib/server/shared/errors";
import type { ApiResponse } from "@/types/api";
import type { Category } from "@/types/category";
import { ErrorCode } from "@/types/errors";

/**
 * GET /api/category?workspace_id=xxx&direction=income|expense&include_archived=true
 * List categories for a workspace
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const searchParams = request.nextUrl.searchParams;
  const workspaceId = searchParams.get("workspace_id");
  const direction = searchParams.get("direction") as CategoryDirection | null;
  const includeArchived = searchParams.get("include_archived") === "true";

  if (!workspaceId) {
    const body: ApiResponse<never> = {
      data: null,
      error: { code: ErrorCode.VALIDATION_ERROR, message: "workspace_id is required" },
    };
    return NextResponse.json(body, { status: 400 });
  }

  return withErrorHandling(
    async () => {
      await verifyWorkspaceMembership(user.id, workspaceId);

      const categories = await listCategories(workspaceId, {
        direction: direction ?? undefined,
        includeArchived,
      });
      const responseBody: ApiResponse<Category[]> = { data: categories, error: null };
      return NextResponse.json(responseBody, { status: 200 });
    },
    { userId: user.id, workspaceId, route: "GET /api/category" },
  );
}

/**
 * POST /api/category
 * Create a custom category
 */
export async function POST(request: NextRequest) {
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

      const parsed = createCategorySchema.safeParse(body);
      if (!parsed.success) {
        const fieldErrors = parsed.error.issues.map((e) => ({
          field: e.path.join(".") || "name",
          message: e.message,
        }));
        throw new ValidationError("Validation failed.", fieldErrors);
      }

      await verifyWorkspaceMembership(user.id, parsed.data.workspace_id);

      const category = await createCategory(parsed.data);
      const responseBody: ApiResponse<Category> = { data: category, error: null };
      return NextResponse.json(responseBody, { status: 201 });
    },
    { userId: user.id, route: "POST /api/category" },
  );
}
