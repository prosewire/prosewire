import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules",
      "**/dist",
      "**/.next",
      "**/.turbo",
      "**/coverage",
      "**/drizzle",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.es2024 },
      parserOptions: { projectService: true, tsconfigRootDir: process.cwd() },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      eqeqeq: ["error", "smart"],
    },
  },
  {
    files: ["**/*.test.{ts,tsx,mts,mjs}", "**/acceptance/**/*.{ts,tsx,mts,mjs}"],
    rules: {
      // Fluent third-party clients sometimes require partial structural fakes
      // in focused unit tests. Production code remains assertion-safe.
      "@typescript-eslint/no-unsafe-type-assertion": "off",
    },
  },
  prettier,
);
