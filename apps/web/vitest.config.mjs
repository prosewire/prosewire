import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      "acceptance/**",
      "src/server/database-behavior.test.ts",
      "src/server/api-access.test.ts",
      "src/server/auth-service.test.ts",
      "src/server/authorization.test.ts",
      "src/server/publishing.test.ts",
      "src/server/workspace-management.test.ts",
      "src/server/*.database.test.ts",
    ],
    coverage: {
      // The PostgreSQL lane measures these files with repository-specific thresholds.
      exclude: [
        "src/server/api-content.ts",
        "src/server/auth-service.ts",
        "src/server/authorization.ts",
        "src/server/content-queries.ts",
        "src/server/publishing.ts",
        "src/server/publishing-repository.ts",
        "src/server/transactional-access.ts",
        "src/server/workspace-management.ts",
        "src/server/workspace-repository.ts",
      ],
      thresholds: { lines: 33, functions: 20, branches: 18, statements: 32 },
    },
  },
});
