/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Mirror the "@/*" -> "./*" path alias from tsconfig.json so ts-jest
  // resolves imports like `@/lib/...` and `@/components/...` the same
  // way Next.js does at build time.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};

export default config;
