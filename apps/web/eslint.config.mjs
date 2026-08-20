import config from "@prosewire/config/eslint/next";

export default [
  ...config,
  { ignores: ["eslint.config.mjs", "postcss.config.mjs", "vitest.config.mjs"] },
  {
    files: [
      "src/app/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
      "src/server/actions.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "effect",
              message:
                "Framework and React boundaries must call Promise entrypoints instead of constructing Effects.",
            },
          ],
        },
      ],
    },
  },
];
