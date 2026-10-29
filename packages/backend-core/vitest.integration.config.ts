import { defineConfig } from "vitest/config";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for integration tests; use a migrated test database.");
}

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    allowOnly: !process.env.CI,
    // Tests share a database; keep suites from racing over background work.
    fileParallelism: false,
  },
});
