import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/index.ts"],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
