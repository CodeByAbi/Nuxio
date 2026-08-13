import type { ApiError } from "@/types/errors";

/** Envelope every API route returns — exactly one of `data`/`error` is non-null. */
export type ApiResponse<T> = { data: T; error: null } | { data: null; error: ApiError };

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export type PaginatedResponse<T> =
  | { data: T[]; meta: PaginationMeta; error: null }
  | { data: null; meta: null; error: ApiError };
