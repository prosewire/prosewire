import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/email-outbox.test.ts",
      "src/publishing.test.ts",
      "src/*.database.test.ts",
    ],
    coverage: {
      include: [
        "src/database.ts",
        "src/email-outbox.ts",
        "src/publishing.ts",
        "src/publishing-repository.ts",
      ],
      reportsDirectory: "coverage/database",
      reporter: ["text", "json", "html"],
      thresholds: {
        statements: 72,
        branches: 20,
        functions: 72,
        lines: 72,
        "src/database.ts": {
          statements: 70,
          branches: 100,
          functions: 55,
          lines: 70,
        },
        "src/email-outbox.ts": {
          statements: 65,
          branches: 15,
          functions: 65,
          lines: 65,
        },
        "src/publishing-repository.ts": {
          statements: 90,
          branches: 50,
          functions: 100,
          lines: 90,
        },
      },
    },
  },
});
