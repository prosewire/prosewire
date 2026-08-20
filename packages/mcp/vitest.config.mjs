import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/server.ts"],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
