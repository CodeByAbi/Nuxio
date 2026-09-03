/**
 * POST /api/workspace
 * Create a new Business workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth/require-auth';
import { createBusinessWorkspace } from '@/lib/server/workspace/workspace.service';
import { createWorkspaceSchema } from '@/types/workspace';
import logger from '@/lib/server/shared/logger';

export async function POST(request: NextRequest) {
  try {
    // Authentication
    const user = await requireAuth();

    // Parse and validate body
    const body = await request.json();
    const validatedData = createWorkspaceSchema.parse(body);

    // Business logic: create workspace
    const workspace = await createBusinessWorkspace(user.id, validatedData);

    logger.info('api.workspace: workspace created', {
      userId: user.id,
      workspaceId: workspace.id,
    });

    return NextResponse.json(
      {
        data: workspace,
        error: null,
      },
      { status: 201 },
    );
  } catch (error: any) {
    logger.error('api.workspace: POST failed', {
      error: error.message,
    });

    // Handle validation errors
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

    // Handle domain errors
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

    // Generic error
    return NextResponse.json(
      {
        data: null,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create workspace',
        },
      },
      { status: 500 },
    );
  }
}
