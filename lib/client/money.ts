/**
 * Client-side money formatting utilities.
 * 
 * Note: Full Money type operations (toMoney, add, subtract, etc.) remain
 * server-side only. Client only formats for display.
 */

/**
 * Format integer amount as IDR currency display.
 * 
 * @param amount - Integer minor unit (Rupiah)
 * @param currency - Currency code (defaults to IDR)
 * @returns Formatted string like "Rp 10.000"
 */
export function formatMoney(amount: number, currency: string = "IDR"): string {
  const symbol = currency === "IDR" ? "Rp" : currency;
  const locale = currency === "IDR" ? "id-ID" : "en-US";
  
  const grouped = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(amount);
  
  return `${symbol} ${grouped}`;
}

/**
 * Parse money input string to integer.
 * Handles: "10000", "10.000", "Rp 10.000"
 * 
 * @param input - String input
 * @returns Integer amount or null if invalid
 */
export function parseMoney(input: string): number | null {
  // Remove currency symbol and whitespace
  const cleaned = input
    .trim()
    .replace(/^Rp\s*/i, "")
    .replace(/\./g, "") // Remove thousand separators
    .replace(/,/g, ""); // Remove commas
  
  if (!/^\d+$/.test(cleaned)) {
    return null;
  }
  
  const value = Number(cleaned);
  
  if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
    return null;
  }
  
  return value;
}
