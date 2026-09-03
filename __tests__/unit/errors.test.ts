import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  InternalError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "@/lib/server/shared/errors";
import { ErrorCode } from "@/types/errors";

describe("error taxonomy", () => {
  it.each([
    [AuthenticationError, ErrorCode.AUTHENTICATION_ERROR, 401],
    [AuthorizationError, ErrorCode.AUTHORIZATION_ERROR, 403],
    [NotFoundError, ErrorCode.NOT_FOUND, 404],
    [ValidationError, ErrorCode.VALIDATION_ERROR, 400],
    [ConflictError, ErrorCode.CONFLICT, 409],
    [RateLimitError, ErrorCode.RATE_LIMIT_EXCEEDED, 429],
    [InternalError, ErrorCode.INTERNAL_ERROR, 500],
  ] as const)("%p has code %s and statusCode %d", (ErrorClass, code, statusCode) => {
    const err = new ErrorClass();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(code);
    expect(err.statusCode).toBe(statusCode);
  });

  it("defaults isOperational to true for expected errors", () => {
    expect(new NotFoundError().isOperational).toBe(true);
    expect(new ValidationError().isOperational).toBe(true);
  });

  it("marks InternalError as non-operational (unexpected failure)", () => {
    expect(new InternalError().isOperational).toBe(false);
  });

  it("accepts a custom message", () => {
    expect(new NotFoundError("Wallet not found").message).toBe("Wallet not found");
  });

  it("carries fieldErrors on ValidationError", () => {
    const err = new ValidationError("Invalid payload", [
      { field: "amount", message: "must be positive" },
    ]);
    expect(err.fieldErrors).toEqual([{ field: "amount", message: "must be positive" }]);
  });

  it("sets name to the concrete class name", () => {
    expect(new ConflictError().name).toBe("ConflictError");
  });

  it("preserves a wrapped cause", () => {
    const cause = new Error("underlying failure");
    const err = new InternalError("wrapped", { cause });
    expect(err.cause).toBe(cause);
  });
});
