import { ErrorCode, type ValidationFieldError } from "@/types/errors";

/**
 * Base of the application error taxonomy. Route handlers catch `AppError`
 * and map it to an HTTP response via `statusCode`; anything that escapes as
 * a non-`AppError` is treated as unexpected (`isOperational: false`) and
 * should be logged with full detail rather than surfaced to the client.
 */
export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly statusCode: number;
  /** true for expected, handled failure modes; false for bugs/crashes. */
  readonly isOperational: boolean = true;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class AuthenticationError extends AppError {
  readonly code = ErrorCode.AUTHENTICATION_ERROR;
  readonly statusCode = 401;

  constructor(message = "Authentication is required.", options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class AuthorizationError extends AppError {
  readonly code = ErrorCode.AUTHORIZATION_ERROR;
  readonly statusCode = 403;

  constructor(
    message = "You do not have permission to perform this action.",
    options?: { cause?: unknown }
  ) {
    super(message, options);
  }
}

export class NotFoundError extends AppError {
  readonly code = ErrorCode.NOT_FOUND;
  readonly statusCode = 404;

  constructor(message = "The requested resource was not found.", options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class ValidationError extends AppError {
  readonly code = ErrorCode.VALIDATION_ERROR;
  readonly statusCode = 422;
  readonly fieldErrors?: ValidationFieldError[];

  constructor(
    message = "The submitted data is invalid.",
    fieldErrors?: ValidationFieldError[],
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.fieldErrors = fieldErrors;
  }
}

export class ConflictError extends AppError {
  readonly code = ErrorCode.CONFLICT;
  readonly statusCode = 409;

  constructor(
    message = "The request conflicts with the current state of the resource.",
    options?: { cause?: unknown }
  ) {
    super(message, options);
  }
}

/**
 * The request is authenticated, authorized, and well-formed, but performing
 * it would violate a business invariant (RN-17 last admin, immutable
 * workspace type, default-category protection, etc.). Maps to 422, same as
 * `ValidationError`, but is semantically about domain state rather than
 * input shape — kept distinct so callers can tell the two apart.
 */
export class DomainRuleError extends AppError {
  readonly code = ErrorCode.DOMAIN_RULE_ERROR;
  readonly statusCode = 422;

  constructor(message = "This action violates a business rule.", options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class RateLimitError extends AppError {
  readonly code = ErrorCode.RATE_LIMIT_EXCEEDED;
  readonly statusCode = 429;

  constructor(
    message = "Too many requests. Please try again later.",
    options?: { cause?: unknown }
  ) {
    super(message, options);
  }
}

export class InternalError extends AppError {
  readonly code = ErrorCode.INTERNAL_ERROR;
  readonly statusCode = 500;
  override readonly isOperational = false;

  constructor(message = "An unexpected error occurred.", options?: { cause?: unknown }) {
    super(message, options);
  }
}
