/**
 * GET/POST /api/workspace/[id]/members
 * List or invite workspace members
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth/require-auth';
import {
  verifyWorkspaceMembership,
  verifyWorkspaceAdmin,
} from '@/lib/server/shared/workspace-guard';
import {
  listMembers,
  inviteMember,
} from '@/lib/server/workspace/workspace.service';
import { inviteMemberSchema } from '@/types/workspace';
import logger from '@/lib/server/shared/logger';

/**
 * GET /api/workspace/[id]/members
 * List all members of workspace
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

    // Fetch members
    const members = await listMembers(workspaceId);

    return NextResponse.json({
      data: members,
      error: null,
    });
  } catch (error: any) {
    logger.error('api.workspace.members: GET failed', {
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
          message: 'Failed to list members',
        },
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/workspace/[id]/members
 * Invite a new member (admin only)
 */
export async function POST(
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
    const validatedData = inviteMemberSchema.parse(body);

    // Invite member
    const member = await inviteMember(workspaceId, validatedData);

    logger.info('api.workspace.members: member invited', {
      userId: user.id,
      workspaceId,
      invitedEmail: validatedData.email,
    });

    return NextResponse.json(
      {
        data: member,
        error: null,
      },
      { status: 201 },
    );
  } catch (error: any) {
    logger.error('api.workspace.members: POST failed', {
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
            message: error.message,
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
          message: 'Failed to invite member',
        },
      },
      { status: 500 },
    );
  }
}
