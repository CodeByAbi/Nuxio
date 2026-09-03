/**
 * GET/PATCH /api/workspace/[id]
 * Get or update workspace by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth/require-auth';
import {
  verifyWorkspaceMembership,
  verifyWorkspaceAdmin,
} from '@/lib/server/shared/workspace-guard';
import {
  getWorkspace,
  updateWorkspace,
} from '@/lib/server/workspace/workspace.service';
import { updateWorkspaceSchema } from '@/types/workspace';
import logger from '@/lib/server/shared/logger';

/**
 * GET /api/workspace/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: workspaceId } = await params;

    // Authentication
    const user = await requireAuth();

    // Authorization: verify workspace membership
    await verifyWorkspaceMembership(user.id, workspaceId);

    // Fetch workspace
    const workspace = await getWorkspace(workspaceId);

    return NextResponse.json({
      data: workspace,
      error: null,
    });
  } catch (error: any) {
    logger.error('api.workspace: GET failed', {
      workspaceId: (await params).id,
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
          message: 'Failed to fetch workspace',
        },
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/workspace/[id]
 * Update workspace settings (admin only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: workspaceId } = await params;

    // Authentication
    const user = await requireAuth();

    // Authorization: verify workspace admin
    await verifyWorkspaceAdmin(user.id, workspaceId);

    // Parse and validate body
    const body = await request.json();
    const validatedData = updateWorkspaceSchema.parse(body);

    // Update workspace
    const workspace = await updateWorkspace(workspaceId, validatedData);

    logger.info('api.workspace: workspace updated', {
      userId: user.id,
      workspaceId,
    });

    return NextResponse.json({
      data: workspace,
      error: null,
    });
  } catch (error: any) {
    logger.error('api.workspace: PATCH failed', {
      workspaceId: (await params).id,
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

    if (error.constructor.name === 'AuthorizationError') {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'Admin access required',
          },
        },
        { status: 403 },
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
          message: 'Failed to update workspace',
        },
      },
      { status: 500 },
    );
  }
}
