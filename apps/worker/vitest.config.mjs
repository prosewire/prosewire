import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      ...(process.env.DATABASE_URL ? [] : ["src/*.database.test.ts"]),
    ],
    coverage: {
      // The PostgreSQL lane measures these files with repository-specific thresholds.
      exclude: [
        "src/database.ts",
        "src/email-outbox.ts",
        "src/publishing-repository.ts",
      ],
    },
  },
});
