import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/migrate.ts"],
  platform: "node",
  format: "esm",
  deps: { alwaysBundle: () => true },
});
