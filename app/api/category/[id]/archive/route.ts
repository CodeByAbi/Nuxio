/**
 * PATCH /api/category/[id]/archive
 * Archive a category (soft delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth/require-auth';
import {
  getCategory,
  archiveCategory,
} from '@/lib/server/category/category.service';
import { verifyWorkspaceMembership } from '@/lib/server/shared/workspace-guard';
import logger from '@/lib/server/shared/logger';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: categoryId } = await params;

    // Authentication
    const user = await requireAuth();

    // Fetch category first to get workspace_id
    const existingCategory = await getCategory(categoryId);

    // Authorization: verify workspace membership
    await verifyWorkspaceMembership(user.id, existingCategory.workspace_id);

    // Archive category
    const category = await archiveCategory(categoryId);

    logger.info('api.category: category archived', {
      userId: user.id,
      workspaceId: existingCategory.workspace_id,
      categoryId,
    });

    return NextResponse.json({
      data: category,
      error: null,
    });
  } catch (error: any) {
    logger.error('api.category: archive failed', {
      categoryId: (await params).id,
      error: error.message,
    });

    if (error.constructor.name === 'AuthenticationError') {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Authentication required',
          },
        },
        { status: 401 },
      );
    }

    if (error.constructor.name === 'NotFoundError') {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'NOT_FOUND',
            message: 'Category not found',
          },
        },
        { status: 404 },
      );
    }

    if (error.constructor.name === 'DomainRuleError') {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'DOMAIN_RULE_ERROR',
            message: error.message,
          },
        },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        data: null,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to archive category',
        },
      },
      { status: 500 },
    );
  }
}
