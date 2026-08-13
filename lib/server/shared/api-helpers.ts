import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/server/shared/supabase-server-client";
import { AuthenticationError, AppError, InternalError, ValidationError } from "@/lib/server/shared/errors";
import { childLogger } from "@/lib/server/shared/logger";
import type { ApiResponse } from "@/types/api";
import type { ValidationFieldError } from "@/types/errors";
import { ErrorCode } from "@/types/errors";

const log = childLogger("api:auth-helper");

/**
 * Verifies that the incoming request has a valid Supabase session.
 *
 * Returns the authenticated `User` on success, or a `NextResponse` (401)
 * that the caller should return immediately if auth failed.
 *
 * Usage:
 * ```ts
 * const authResult = await requireAuth();
 * if (authResult instanceof NextResponse) return authResult;
 * const { user } = authResult;
 * ```
 */
export async function requireAuth(): Promise<{ user: User } | NextResponse> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return buildUnauthenticatedResponse();
    }

    return { user };
  } catch (err) {
    log.error({ err }, "requireAuth: unexpected error verifying session");
    return buildUnauthenticatedResponse();
  }
}

function buildUnauthenticatedResponse(): NextResponse {
  const err = new AuthenticationError();
  const body: ApiResponse<never> = {
    data: null,
    error: { code: ErrorCode.AUTHENTICATION_ERROR, message: err.message },
  };
  return NextResponse.json(body, { status: 401 });
}

/**
 * Wraps a route handler so `AppError` subclasses are automatically mapped to
 * their HTTP status code and error payload, while unexpected errors become 500.
 */
export async function withErrorHandling(
  handler: () => Promise<NextResponse>,
  logContext: Record<string, unknown> = {},
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof AppError) {
      if (!err.isOperational) {
        log.error({ ...logContext, err }, "Unexpected operational error");
      }
      const fieldErrors: ValidationFieldError[] | undefined =
        err instanceof ValidationError ? err.fieldErrors : undefined;
      const body: ApiResponse<never> = {
        data: null,
        error: {
          code: err.code,
          message: err.message,
          ...(fieldErrors ? { fieldErrors } : {}),
        },
      };
      return NextResponse.json(body, { status: err.statusCode });
    }

    log.error({ ...logContext, err }, "Unhandled error in route handler");
    const internalErr = new InternalError();
    const body: ApiResponse<never> = {
      data: null,
      error: { code: internalErr.code, message: internalErr.message },
    };
    return NextResponse.json(body, { status: 500 });
  }
}
