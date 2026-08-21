# `@prosewire/next`

Headless-first Prosewire readers for the Next.js App Router and Pages Router.

The package renders semantic HTML with stable `pw-*` classes and no bundled stylesheet. Style those classes, replace the supplied page components, or use the returned public client directly.

## App Router

```ts
import { createProsewireApp } from "@prosewire/next/app";

export const blog = createProsewireApp({
  baseUrl: "https://publish.example.com",
  publication: "fieldnotes",
  basePath: "/blog",
});
```

```tsx
// app/blog/[slug]/page.tsx
import { blog } from "@/lib/prosewire";

export const generateMetadata = blog.post.generateMetadata;
export default blog.post.Page;
```

Use `blog.index` for the publication index.

## Pages Router

```ts
import { createProsewirePages } from "@prosewire/next/pages";
```

The returned `index` and `post` objects expose their page components and the matching `getStaticProps` or `getStaticPaths` functions.

## Replace the markup

Pass `components.IndexPage` or `components.PostPage` when creating the integration. Both receive typed public data, the configured base path, and no hidden styling requirements.
