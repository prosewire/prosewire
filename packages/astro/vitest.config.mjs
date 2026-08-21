import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.ts"],
      thresholds: { lines: 85, functions: 85, branches: 75, statements: 85 },
    },
  },
});
