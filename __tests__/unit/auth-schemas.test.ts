import { loginSchema, registerSchema } from "@/lib/shared/schemas/auth";

describe("registerSchema", () => {
  it("accepts a valid email and a password with a letter and a digit", () => {
    const result = registerSchema.safeParse({ email: "user@example.com", password: "abcd1234" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({ email: "not-an-email", password: "abcd1234" });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({ email: "user@example.com", password: "ab1" });
    expect(result.success).toBe(false);
  });

  it("rejects a password with no digit", () => {
    const result = registerSchema.safeParse({ email: "user@example.com", password: "abcdefgh" });
    expect(result.success).toBe(false);
  });

  it("rejects a password with no letter", () => {
    const result = registerSchema.safeParse({ email: "user@example.com", password: "12345678" });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid email with any non-empty password (no complexity rule at login)", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "" });
    expect(result.success).toBe(false);
  });
});
