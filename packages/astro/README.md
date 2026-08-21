# `@prosewire/astro`

Headless-first Prosewire readers for Astro static and server-rendered sites.

The integration can inject `/blog` routes for the shortest setup. Its components render semantic HTML with stable `pw-*` classes and no bundled stylesheet.

```js
import { defineConfig } from "astro/config";
import prosewire from "@prosewire/astro";

export default defineConfig({
  integrations: [
    prosewire({
      baseUrl: "https://publish.example.com",
      publication: "fieldnotes",
      basePath: "/blog",
    }),
  ],
});
```

Set `injectRoutes: false` to use `createProsewire` and the exported `.astro` components inside your own pages and layouts.

Static Astro projects fetch content during the build. Server-rendered projects resolve content per request and return shared-cache headers.
