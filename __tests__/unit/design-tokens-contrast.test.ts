import { readFileSync } from "fs";
import { join } from "path";

import { wcagContrast } from "culori";

/**
 * Gate for docs/12. UI Design System.md §12.2/§12.8 semantic tokens — verified
 * with culori (a tested third-party color library), not the ad-hoc OKLCH math
 * used to pick the values originally. Reads app/globals.css directly so a
 * future token edit is caught here instead of relying on manual recheck.
 *
 * WCAG 4.5:1 is the floor for normal-size text; every pair below is used for
 * button/badge/alert text, never large-text-only, so 4.5 applies uniformly.
 * This is a paper check, not a display check — see
 * docs/12. UI Design System.md §12.8 "Verifikasi tampilan nyata" for the
 * required manual screenshot pass, especially for `critical`/`warning`.
 */

const WCAG_AA_NORMAL_TEXT = 4.5;

const TOKEN_PAIRS = ["safe", "warning", "critical", "neutral", "brand"] as const;

function extractBlock(css: string, selector: string): string {
  const selectorIndex = css.indexOf(`${selector} {`);
  if (selectorIndex === -1) {
    throw new Error(`Selector "${selector}" not found in app/globals.css`);
  }
  const braceStart = css.indexOf("{", selectorIndex);
  const braceEnd = css.indexOf("}", braceStart);
  return css.slice(braceStart + 1, braceEnd);
}

function extractVar(block: string, name: string, selector: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  const value = match?.[1];
  if (value === undefined) {
    throw new Error(`--${name} not found inside "${selector}" block of app/globals.css`);
  }
  return value.trim();
}

const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8");
const lightBlock = extractBlock(globalsCss, ":root");
const darkBlock = extractBlock(globalsCss, ".dark");

describe("semantic design token contrast (WCAG AA, culori-verified)", () => {
  describe.each([
    { mode: "light", block: lightBlock, selector: ":root" },
    { mode: "dark", block: darkBlock, selector: ".dark" },
  ])("$mode mode", ({ block, selector }) => {
    it.each(TOKEN_PAIRS)("--%s / --%s-foreground passes 4.5:1", (token) => {
      const bg = extractVar(block, token, selector);
      const fg = extractVar(block, `${token}-foreground`, selector);

      const ratio = wcagContrast(bg, fg);

      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });
  });
});
