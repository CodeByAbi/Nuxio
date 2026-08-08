import { ValidationError } from "@/lib/server/shared/errors";

/**
 * Money is always an integer minor unit (ADR §5: "Tipe uang direpresentasikan
 * sebagai bigint/number integer minor unit dengan branded type"). For this
 * app IDR minor unit === 1 Rupiah (no sen in practical use), so amounts are
 * never divided/multiplied by 100 anywhere — display formatting only adds
 * grouping separators and a currency symbol.
 *
 * The brand prevents a plain `number` from being passed anywhere a `Money`
 * is expected without going through `toMoney`, which enforces "no float".
 */
declare const MoneyBrand: unique symbol;
export type Money = number & { readonly [MoneyBrand]: "Money" };

export type Currency = "IDR";

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  IDR: "Rp",
};

const CURRENCY_LOCALES: Record<Currency, string> = {
  IDR: "id-ID",
};

export const DEFAULT_CURRENCY: Currency = "IDR";

export const ZERO: Money = toMoney(0);

/** Validates and brands a plain number as `Money`. Throws on any non-integer input — this is the only gate that keeps floats out of the system. */
export function toMoney(value: number): Money {
  if (!Number.isFinite(value)) {
    throw new ValidationError(`Money amount must be a finite number, got: ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new ValidationError(
      `Money amount must be an integer minor unit (no floating point), got: ${value}`
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new ValidationError(`Money amount exceeds the safe integer range: ${value}`);
  }
  return value as Money;
}

export function add(a: Money, b: Money): Money {
  return toMoney(a + b);
}

export function subtract(a: Money, b: Money): Money {
  return toMoney(a - b);
}

/** Scales by an integer factor (e.g. quantity). Never accepts a fractional factor — use `divide` with an explicit rounding mode for that. */
export function multiply(amount: Money, factor: number): Money {
  if (!Number.isInteger(factor)) {
    throw new ValidationError(`Money multiply factor must be an integer, got: ${factor}`);
  }
  return toMoney(amount * factor);
}

export type RoundingMode = "round" | "floor" | "ceil";

/** Divides by an integer divisor, rounding to the nearest minor unit (mode defaults to "round") since minor units cannot be fractional. */
export function divide(amount: Money, divisor: number, mode: RoundingMode = "round"): Money {
  if (!Number.isInteger(divisor) || divisor === 0) {
    throw new ValidationError(`Money divisor must be a non-zero integer, got: ${divisor}`);
  }
  const quotient = amount / divisor;
  const rounded =
    mode === "floor"
      ? Math.floor(quotient)
      : mode === "ceil"
        ? Math.ceil(quotient)
        : Math.round(quotient);
  return toMoney(rounded);
}

/** Formats as e.g. "Rp 10.000" — grouped digits, currency symbol prefix, no decimal places. */
export function format(amount: Money, currency: Currency = DEFAULT_CURRENCY): string {
  const grouped = new Intl.NumberFormat(CURRENCY_LOCALES[currency], {
    maximumFractionDigits: 0,
  }).format(amount);
  return `${CURRENCY_SYMBOLS[currency]} ${grouped}`;
}

/** Parses "Rp 10.000", "10.000", or "10000" back into a Money value. */
export function parse(input: string, currency: Currency = DEFAULT_CURRENCY): Money {
  const symbol = CURRENCY_SYMBOLS[currency];
  const withoutSymbol = input.trim().replace(new RegExp(`^${symbol}\\s*`, "i"), "");
  const cleaned = withoutSymbol.replace(/\./g, "").replace(/,/g, "").trim();
  if (!/^\d+$/.test(cleaned)) {
    throw new ValidationError(`Invalid money string: "${input}"`);
  }
  return toMoney(Number(cleaned));
}
