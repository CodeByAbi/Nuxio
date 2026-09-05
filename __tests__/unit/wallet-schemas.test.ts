/**
 * Unit tests for wallet Zod schemas.
 * 
 * Tests validation rules for:
 * - createWalletSchema: name, initial_balance, wallet_type, currency
 * - listWalletsQuerySchema: workspace_id, include_archived
 * - archiveWalletSchema: id, workspace_id
 * 
 * Critical business rules tested:
 * - initial_balance must be integer >= 0 (no negative, no float)
 * - name must be 1-50 characters
 */

import {
  createWalletSchema,
  listWalletsQuerySchema,
  archiveWalletSchema,
} from "@/lib/shared/schemas/wallet";

describe("createWalletSchema", () => {
  const validBase = {
    workspace_id: "00000000-0000-0000-0000-000000000001",
    name: "BCA",
    initial_balance: 5000000,
  };

  describe("name validation", () => {
    it("accepts valid name (1-50 characters)", () => {
      const result = createWalletSchema.safeParse(validBase);
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        name: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/at least 1 character/i);
      }
    });

    it("rejects name exceeding 50 characters", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        name: "A".repeat(51),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/50 characters/i);
      }
    });

    it("trims whitespace from name", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        name: "  BCA  ",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("BCA");
      }
    });
  });

  describe("initial_balance validation", () => {
    it("accepts zero", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        initial_balance: 0,
      });
      expect(result.success).toBe(true);
    });

    it("accepts positive integer", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        initial_balance: 10000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative integer", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        initial_balance: -1,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/greater than or equal to 0/i);
      }
    });

    it("rejects negative large value", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        initial_balance: -1000,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/greater than or equal to 0/i);
      }
    });

    it("rejects floating point value", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        initial_balance: 100.5,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/integer/i);
      }
    });

    it("rejects floating point with small decimal", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        initial_balance: 100.01,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/integer/i);
      }
    });

    it("rejects non-numeric value", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        initial_balance: "not a number",
      });
      expect(result.success).toBe(false);
    });

    it("requires initial_balance", () => {
      const { initial_balance, ...withoutBalance } = validBase;
      const result = createWalletSchema.safeParse(withoutBalance);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/required/i);
      }
    });
  });

  describe("wallet_type validation", () => {
    it("accepts 'personal'", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        wallet_type: "personal",
      });
      expect(result.success).toBe(true);
    });

    it("accepts 'business'", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        wallet_type: "business",
      });
      expect(result.success).toBe(true);
    });

    it("accepts null", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        wallet_type: null,
      });
      expect(result.success).toBe(true);
    });

    it("accepts undefined (optional)", () => {
      const result = createWalletSchema.safeParse(validBase);
      expect(result.success).toBe(true);
    });

    it("rejects invalid value", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        wallet_type: "invalid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("currency validation", () => {
    it("defaults to IDR when not provided", () => {
      const result = createWalletSchema.safeParse(validBase);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe("IDR");
      }
    });

    it("accepts valid 3-character code", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        currency: "USD",
      });
      expect(result.success).toBe(true);
    });

    it("converts to uppercase", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        currency: "usd",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe("USD");
      }
    });

    it("rejects currency with wrong length", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        currency: "US",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("workspace_id validation", () => {
    it("requires workspace_id", () => {
      const { workspace_id, ...withoutWorkspace } = validBase;
      const result = createWalletSchema.safeParse(withoutWorkspace);
      expect(result.success).toBe(false);
    });

    it("rejects invalid UUID", () => {
      const result = createWalletSchema.safeParse({
        ...validBase,
        workspace_id: "not-a-uuid",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/UUID/i);
      }
    });
  });
});

describe("listWalletsQuerySchema", () => {
  const validQuery = {
    workspace_id: "00000000-0000-0000-0000-000000000001",
  };

  it("accepts valid query with workspace_id only", () => {
    const result = listWalletsQuerySchema.safeParse(validQuery);
    expect(result.success).toBe(true);
  });

  it("defaults include_archived to false", () => {
    const result = listWalletsQuerySchema.safeParse(validQuery);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.include_archived).toBe(false);
    }
  });

  it("transforms 'true' string to true boolean", () => {
    const result = listWalletsQuerySchema.safeParse({
      ...validQuery,
      include_archived: "true",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.include_archived).toBe(true);
    }
  });

  it("transforms 'false' string to false boolean", () => {
    const result = listWalletsQuerySchema.safeParse({
      ...validQuery,
      include_archived: "false",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.include_archived).toBe(false);
    }
  });

  it("requires workspace_id", () => {
    const result = listWalletsQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid workspace_id UUID", () => {
    const result = listWalletsQuerySchema.safeParse({
      workspace_id: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

describe("archiveWalletSchema", () => {
  const validArchive = {
    id: "00000000-0000-0000-0000-000000000001",
    workspace_id: "00000000-0000-0000-0000-000000000002",
  };

  it("accepts valid archive input", () => {
    const result = archiveWalletSchema.safeParse(validArchive);
    expect(result.success).toBe(true);
  });

  it("requires id", () => {
    const { id, ...withoutId } = validArchive;
    const result = archiveWalletSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
  });

  it("requires workspace_id", () => {
    const { workspace_id, ...withoutWorkspace } = validArchive;
    const result = archiveWalletSchema.safeParse(withoutWorkspace);
    expect(result.success).toBe(false);
  });

  it("rejects invalid id UUID", () => {
    const result = archiveWalletSchema.safeParse({
      ...validArchive,
      id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid workspace_id UUID", () => {
    const result = archiveWalletSchema.safeParse({
      ...validArchive,
      workspace_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
