import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: [
      "src/server/database-behavior.test.ts",
      "src/server/*.database.test.ts",
    ],
    coverage: {
      include: [
        "src/server/api-access.ts",
        "src/server/api-content.ts",
        "src/server/auth-service.ts",
        "src/server/authorization.ts",
        "src/server/content-queries.ts",
        "src/server/publishing-repository.ts",
        "src/server/transactional-access.ts",
        "src/server/workspace-repository.ts",
      ],
      reportsDirectory: "coverage/database",
      reporter: ["text", "json", "html"],
      thresholds: {
        statements: 85,
        branches: 65,
        functions: 85,
        lines: 85,
        "src/server/api-access.ts": {
          statements: 75,
          branches: 65,
          functions: 65,
          lines: 75,
        },
        "src/server/api-content.ts": {
          statements: 95,
          branches: 60,
          functions: 90,
          lines: 95,
        },
        "src/server/auth-service.ts": {
          statements: 40,
          branches: 40,
          functions: 8,
          lines: 38,
        },
        "src/server/authorization.ts": {
          statements: 90,
          branches: 85,
          functions: 85,
          lines: 90,
        },
        "src/server/content-queries.ts": {
          statements: 98,
          branches: 70,
          functions: 95,
          lines: 98,
        },
        "src/server/publishing-repository.ts": {
          statements: 80,
          branches: 60,
          functions: 85,
          lines: 80,
        },
        "src/server/transactional-access.ts": {
          statements: 100,
          branches: 80,
          functions: 100,
          lines: 100,
        },
        "src/server/workspace-repository.ts": {
          statements: 90,
          branches: 65,
          functions: 100,
          lines: 90,
        },
      },
    },
  },
});
