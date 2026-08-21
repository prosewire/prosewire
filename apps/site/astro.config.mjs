import mdx from "@astrojs/mdx";
import { unified } from "@astrojs/markdown-remark";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import {
  rehypeCode,
  remarkCodeTab,
  remarkHeading,
  remarkNpm,
  remarkStructure,
} from "fumadocs-core/mdx-plugins";
import { defineConfig } from "astro/config";

const site = process.env.SITE_URL ?? "http://localhost:4321";

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "always",
  markdown: {
    syntaxHighlight: false,
    processor: unified({
      remarkPlugins: [remarkHeading, remarkCodeTab, remarkNpm, [remarkStructure, { exportAs: "structuredData" }]],
      rehypePlugins: [rehypeCode],
    }),
  },
  integrations: [
    react(),
    mdx({ extendMarkdownConfig: true, syntaxHighlight: false }),
    ...(site ? [sitemap()] : []),
  ],
  vite: { plugins: [tailwindcss()] },
});
