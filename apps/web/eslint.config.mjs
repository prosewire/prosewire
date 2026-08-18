import config from "@prosewire/config/eslint/next";

export default [
  ...config,
  { ignores: ["eslint.config.mjs", "postcss.config.mjs"] },
];
