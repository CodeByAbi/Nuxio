/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/db/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  setupFiles: ["<rootDir>/__tests__/db/env-setup.cjs"],
  // RLS/concurrency/signup-trigger tests hit a real Postgres instance over
  // the network and run multiple requests per case — slower than the
  // default 5s.
  testTimeout: 30000,
  // These tests share workspaces/users against one live database; running
  // files in parallel risks advisory-lock/row contention between unrelated
  // test files.
  maxWorkers: 1,
};

export default config;
