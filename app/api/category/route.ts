/**
 * GET/POST /api/category
 * List or create categories
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth/require-auth';
import { verifyWorkspaceMembership } from '@/lib/server/shared/workspace-guard';
import {
  listCategories,
  createCategory,
} from '@/lib/server/category/category.service';
import { createCategorySchema, CategoryDirection } from '@/types/category';
import logger from '@/lib/server/shared/logger';

/**
 * GET /api/category?workspace_id=xxx&direction=income|expense&include_archived=true
 * List categories for a workspace
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication
    const user = await requireAuth();

    // Get query params
    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get('workspace_id');
    const direction = searchParams.get('direction') as
      | CategoryDirection
      | null;
    const includeArchived = searchParams.get('include_archived') === 'true';

    if (!workspaceId) {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'workspace_id is required',
          },
        },
        { status: 400 },
      );
    }

    // Authorization: verify workspace membership
    await verifyWorkspaceMembership(user.id, workspaceId);

    // Fetch categories
    const categories = await listCategories(workspaceId, {
      direction: direction || undefined,
      includeArchived,
    });

    return NextResponse.json({
      data: categories,
      error: null,
    });
  } catch (error: any) {
    logger.error('api.category: GET failed', {
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
            message: 'Workspace not found',
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        data: null,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list categories',
        },
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/category
 * Create a custom category
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication
    const user = await requireAuth();

    // Parse and validate body
    const body = await request.json();
    const validatedData = createCategorySchema.parse(body);

    // Authorization: verify workspace membership
    await verifyWorkspaceMembership(user.id, validatedData.workspace_id);

    // Create category
    const category = await createCategory(validatedData);

    logger.info('api.category: category created', {
      userId: user.id,
      workspaceId: validatedData.workspace_id,
      categoryId: category.id,
    });

    return NextResponse.json(
      {
        data: category,
        error: null,
      },
      { status: 201 },
    );
  } catch (error: any) {
    logger.error('api.category: POST failed', {
      error: error.message,
    });

    if (error.name === 'ZodError') {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        },
        { status: 400 },
      );
    }

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
            message: 'Workspace not found',
          },
        },
        { status: 404 },
      );
    }

    if (error.constructor.name === 'ConflictError') {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'CONFLICT',
            message: error.message,
          },
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        data: null,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create category',
        },
      },
      { status: 500 },
    );
  }
}
