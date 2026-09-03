/**
 * Unit tests for `updateProfileSchema` (types/profile.ts) — the Zod schema
 * actually used by PATCH /api/profile (see app/api/profile/route.ts).
 */
import { updateProfileSchema } from "@/types/profile";

describe("updateProfileSchema", () => {
  it("rejects an empty string", () => {
    const result = updateProfileSchema.safeParse({ display_name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    const result = updateProfileSchema.safeParse({ display_name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a tab/newline-only string", () => {
    const result = updateProfileSchema.safeParse({ display_name: "\t\n  \t" });
    expect(result.success).toBe(false);
  });

  it("trims leading/trailing whitespace from an otherwise valid name", () => {
    const result = updateProfileSchema.safeParse({ display_name: "  Alice  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.display_name).toBe("Alice");
    }
  });

  it("accepts a normal name", () => {
    const result = updateProfileSchema.safeParse({ display_name: "Alice Wonderland" });
    expect(result.success).toBe(true);
  });

  it("accepts the minimum valid length (1 char)", () => {
    const result = updateProfileSchema.safeParse({ display_name: "X" });
    expect(result.success).toBe(true);
  });

  it("accepts exactly 50 characters", () => {
    const result = updateProfileSchema.safeParse({ display_name: "X".repeat(50) });
    expect(result.success).toBe(true);
  });

  it("rejects 51 characters", () => {
    const result = updateProfileSchema.safeParse({ display_name: "X".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string type", () => {
    const result = updateProfileSchema.safeParse({ display_name: 12345 });
    expect(result.success).toBe(false);
  });

  it("rejects a missing display_name field", () => {
    const result = updateProfileSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("strips unexpected fields rather than rejecting the request (mass-assignment guard)", () => {
    const result = updateProfileSchema.safeParse({
      display_name: "Alice",
      id: "someone-elses-id",
      avatar_url: "https://evil.example.com/x",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ display_name: "Alice" });
    }
  });

  it("a display name that would be valid after trimming at exactly 50 chars still passes", () => {
    const result = updateProfileSchema.safeParse({ display_name: `  ${"X".repeat(50)}  ` });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.display_name.length).toBe(50);
    }
  });
});
