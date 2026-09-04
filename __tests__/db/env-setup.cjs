// Minimal .env loader for local `npm run test:db` runs. CI sets
// SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY directly as job
// env vars (see .github/workflows/ci.yml) — this only fills them in locally
// from the repo's .env file, and never overrides a value that's already set.
//
// Jest's `setupFiles` loads this as plain CommonJS before any ESM/TS
// transform is available, so `require` here is a Node/Jest-tooling
// constraint, not a stylistic choice.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "../../.env");
if (!fs.existsSync(envPath)) return;

for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;

  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;

  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}
