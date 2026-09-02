import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import {
  rehypeCode,
  remarkCodeTab,
  remarkHeading,
  remarkNpm,
  remarkStructure,
} from "fumadocs-core/mdx-plugins";
import { resolveSiteOrigin } from "./site-origin.mjs";

const site = resolveSiteOrigin();

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "always",
  markdown: {
    syntaxHighlight: false,
    processor: unified({
      remarkPlugins: [
        remarkHeading,
        remarkCodeTab,
        remarkNpm,
        [remarkStructure, { exportAs: "structuredData" }],
      ],
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
