/**
 * DELETE /api/workspace/[id]/members/[memberId]
 * Remove a member from workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth/require-auth';
import { verifyWorkspaceAdmin } from '@/lib/server/shared/workspace-guard';
import { removeMember } from '@/lib/server/workspace/workspace.service';
import logger from '@/lib/server/shared/logger';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  try {
    const { id: workspaceId, memberId } = await params;

    // Authentication
    const user = await requireAuth();

    // Authorization: verify workspace admin
    await verifyWorkspaceAdmin(user.id, workspaceId);

    // Remove member
    await removeMember(workspaceId, memberId);

    logger.info('api.workspace.members: member removed', {
      userId: user.id,
      workspaceId,
      memberId,
    });

    return NextResponse.json({
      data: { success: true },
      error: null,
    });
  } catch (error: any) {
    logger.error('api.workspace.members: DELETE failed', {
      workspaceId: (await params).id,
      memberId: (await params).memberId,
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
            message: 'Workspace or member not found',
          },
        },
        { status: 404 },
      );
    }

    // Handle RN-17: cannot remove last admin
    if (error.constructor.name === 'DomainRuleError') {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'LAST_ADMIN',
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
          message: 'Failed to remove member',
        },
      },
      { status: 500 },
    );
  }
}
