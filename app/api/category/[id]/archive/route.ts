/**
 * PATCH /api/category/[id]/archive
 * Archive a category (soft delete)
 */

import { NextResponse } from "next/server";

import { requireAuth, withErrorHandling } from "@/lib/server/shared/api-helpers";
import { getCategory, archiveCategory } from "@/lib/server/category/category.service";
import { verifyWorkspaceMembership } from "@/lib/server/shared/workspace-guard";
import type { ApiResponse } from "@/types/api";
import type { Category } from "@/types/category";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  const { id: categoryId } = await params;

  return withErrorHandling(
    async () => {
      // Fetch category first to get its (real, server-derived) workspace_id
      // — never trust a client-supplied workspace_id for this check.
      const existingCategory = await getCategory(categoryId);

      await verifyWorkspaceMembership(user.id, existingCategory.workspace_id);

      const category = await archiveCategory(categoryId);
      const responseBody: ApiResponse<Category> = { data: category, error: null };
      return NextResponse.json(responseBody, { status: 200 });
    },
    { userId: user.id, categoryId, route: "PATCH /api/category/[id]/archive" },
  );
}
