import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      "src/publishing.test.ts",
      "src/*.database.test.ts",
    ],
    coverage: {
      // The PostgreSQL lane measures these files with repository-specific thresholds.
      exclude: [
        "src/database.ts",
        "src/publishing.ts",
        "src/publishing-repository.ts",
      ],
    },
  },
});
