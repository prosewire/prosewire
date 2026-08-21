import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
