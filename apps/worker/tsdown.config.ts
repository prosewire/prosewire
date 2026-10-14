import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/migrate.ts", "src/wake.ts"],
  platform: "node",
  format: "esm",
  deps: { alwaysBundle: () => true },
});
