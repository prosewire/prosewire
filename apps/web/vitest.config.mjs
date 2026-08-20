import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "acceptance/**"],
    coverage: {
      thresholds: { lines: 33, functions: 20, branches: 18, statements: 32 },
    },
  },
});
