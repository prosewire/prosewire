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
      ...(process.env.DATABASE_URL
        ? []
        : ["src/server/database-behavior.test.ts"]),
    ],
    coverage: {
      exclude: [
        "src/server/auth-service.ts",
        "src/server/authorization.ts",
        "src/server/publishing-repository.ts",
        "src/server/transactional-access.ts",
        "src/server/workspace-management.ts",
        "src/server/workspace-repository.ts",
      ],
      thresholds: { lines: 33, functions: 20, branches: 18, statements: 32 },
    },
  },
});
