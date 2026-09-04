/**
 * CANONICAL CONTRACT — do not change shape without a migration plan.
 *
 * Shared error types consumed by both `lib/server/shared/errors.ts` (the
 * `AppError` taxonomy) and API route handlers building `ApiError` payloads.
 * `ApiError` mirrors `docs/10. API.md`'s `{ code, message, field? }` error
 * object, with one deliberate superset: `fieldErrors?: ValidationFieldError[]`
 * instead of doc10's single `field?: string` — this repo needs to report
 * more than one invalid field per validation failure (e.g. a form with two
 * bad inputs), which a single `field` string can't express. That's an
 * additive extension of doc10, not a contradiction of it.
 */

export enum ErrorCode {
  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  CONFLICT = "CONFLICT",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  /** A request is well-formed and the caller is authorized, but the action
   * violates a business rule (e.g. archiving a default category). Distinct
   * from VALIDATION_ERROR, which is about malformed input shape, not domain
   * state. */
  DOMAIN_RULE_ERROR = "DOMAIN_RULE_ERROR",
  /** RN-17: the mutation would leave a workspace with zero admins. A more
   * specific wire code than DOMAIN_RULE_ERROR because the Roadmap contracts
   * for this exact string on the member-removal/demotion endpoints. */
  LAST_ADMIN = "LAST_ADMIN",
}

export interface ValidationFieldError {
  field: string;
  message: string;
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  fieldErrors?: ValidationFieldError[];
}
