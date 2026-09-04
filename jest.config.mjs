/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Real-Supabase tests live under __tests__/db and run via `npm run test:db`
  // (jest.db.config.mjs) — they need a live Postgres/Auth instance and are
  // excluded from the default `npm test` run, which stays mock-only and fast.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/__tests__/db/"],
  // Mirror the "@/*" -> "./*" path alias from tsconfig.json so ts-jest
  // resolves imports like `@/lib/...` and `@/components/...` the same
  // way Next.js does at build time.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};

export default config;
