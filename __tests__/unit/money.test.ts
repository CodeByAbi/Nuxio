import { add, divide, format, multiply, parse, subtract, toMoney, ZERO } from "@/lib/server/shared/money";
import { ValidationError } from "@/lib/server/shared/errors";

describe("money", () => {
  describe("toMoney", () => {
    it("brands a safe integer", () => {
      expect(toMoney(10_000)).toBe(10_000);
    });

    it("rejects non-integers (no floating point allowed)", () => {
      expect(() => toMoney(10_000.5)).toThrow(ValidationError);
    });

    it("rejects NaN/Infinity", () => {
      expect(() => toMoney(Number.POSITIVE_INFINITY)).toThrow(ValidationError);
      expect(() => toMoney(Number.NaN)).toThrow(ValidationError);
    });

    it("rejects unsafe integers", () => {
      expect(() => toMoney(Number.MAX_SAFE_INTEGER + 10)).toThrow(ValidationError);
    });
  });

  describe("add / subtract", () => {
    it("adds two amounts", () => {
      expect(add(toMoney(1000), toMoney(500))).toBe(1500);
    });

    it("subtracts two amounts", () => {
      expect(subtract(toMoney(1000), toMoney(500))).toBe(500);
    });

    it("allows a negative result (derived balances may go negative)", () => {
      expect(subtract(toMoney(500), toMoney(1000))).toBe(-500);
    });
  });

  describe("multiply", () => {
    it("scales by an integer factor", () => {
      expect(multiply(toMoney(1000), 3)).toBe(3000);
    });

    it("rejects a fractional factor", () => {
      expect(() => multiply(toMoney(1000), 1.5)).toThrow(ValidationError);
    });
  });

  describe("divide", () => {
    it("divides and rounds to the nearest minor unit by default", () => {
      expect(divide(toMoney(1000), 3)).toBe(333);
    });

    it("supports floor and ceil rounding modes", () => {
      expect(divide(toMoney(1000), 3, "floor")).toBe(333);
      expect(divide(toMoney(1000), 3, "ceil")).toBe(334);
    });

    it("rejects a zero or fractional divisor", () => {
      expect(() => divide(toMoney(1000), 0)).toThrow(ValidationError);
      expect(() => divide(toMoney(1000), 2.5)).toThrow(ValidationError);
    });
  });

  describe("format", () => {
    it("formats IDR with grouping separators and no decimals", () => {
      expect(format(toMoney(10_000))).toBe("Rp 10.000");
    });

    it("formats zero", () => {
      expect(format(ZERO)).toBe("Rp 0");
    });
  });

  describe("parse", () => {
    it("parses a formatted string back into Money", () => {
      expect(parse("Rp 10.000")).toBe(10_000);
    });

    it("parses a bare digit string", () => {
      expect(parse("10000")).toBe(10_000);
    });

    it("round-trips format -> parse", () => {
      const original = toMoney(1_234_567);
      expect(parse(format(original))).toBe(original);
    });

    it("rejects garbage input", () => {
      expect(() => parse("not money")).toThrow(ValidationError);
    });
  });
});
