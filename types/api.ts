import type { ApiError } from "@/types/errors";

/**
 * CANONICAL CONTRACT — do not change shape without a migration plan.
 *
 * This matches `docs/10. API.md` §"Format response sukses/error" exactly:
 * `{ data, meta? }` on success, `{ error: { code, message, field? } }` on
 * failure. There is deliberately no `success: boolean` discriminant field —
 * `data`/`error` nullability already discriminates the union, and doc10 does
 * not specify one. Every route handler, frontend caller, and integration
 * test in this repo is written against this exact shape (see
 * `app/api/health/route.ts`, `__tests__/integration/health.test.ts`).
 * Changing it is a breaking change for every consumer, not a local edit —
 * confirm against doc10 first, then update all call sites in one PR.
 */
export type ApiResponse<T> = { data: T; error: null } | { data: null; error: ApiError };

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export type PaginatedResponse<T> =
  { data: T[]; meta: PaginationMeta; error: null } | { data: null; meta: null; error: ApiError };
