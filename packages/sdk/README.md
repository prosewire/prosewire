# `@prosewire/sdk`

Typed clients for Prosewire's authenticated management API and public content API.

The package is on the `0.2.x` release line. Pin a compatible version and review the changelog before upgrading while the public contract is pre-1.0.

Full guide: [Build a native reader with TypeScript](https://prosewire.com/docs/integrate/typescript/)

## Install

```sh
pnpm add @prosewire/sdk
```

Node.js 24 or newer is supported.

## Read published content

```ts
import { createPublicClient } from "@prosewire/sdk";

const publicContent = createPublicClient({
  baseUrl: "https://your-prosewire-deployment",
  blog: "fieldnotes",
});

const page = await publicContent.listPosts({ page: 1, pageSize: 20 });
console.log(page.posts.map((post) => post.title));
```

Filter lists and retrieve JSON or rendered HTML:

```ts
const page = await publicContent.listPosts({
  search: "portable",
  category: "engineering",
  page: 1,
  pageSize: 20,
});

console.log(page.posts.map((post) => post.title));
const article = await publicContent.getPost("welcome");
const html = await publicContent.getRendered("welcome");
```

Public clients need no key and only return published content whose publication time has arrived. `pageSize` is capped at 100. The deprecated `limit` option remains an alias for `pageSize`.

## Manage a publication

Create a publication-scoped API key in **Settings → Developer** and keep it on a trusted server:

```ts
import { createClient } from "@prosewire/sdk";

const management = createClient({
  baseUrl: process.env.PROSEWIRE_API_URL!,
  apiKey: process.env.PROSEWIRE_API_KEY!,
});

const drafts = await management.posts.list({ status: "draft" });
```

Available Promise operations are:

- `health()`
- `blogs.list()`
- `posts.list()`, `posts.get()`, and `posts.create()`
- `posts.update()` and `posts.archive()`

Management keys are publication-scoped. Reads require `content:read`; create, update, and archive require `content:write`. Never expose a management key in browser JavaScript.

For Effect applications, `createEffectClient` exposes the same operations as
typed Effects. `createClient` is the Promise-compatible facade for existing
callers; both are generated from the shared Effect HttpApi contract.

Non-success responses reject. Public-client errors include the HTTP status; management errors retain the typed Effect HTTP API failure when using `createEffectClient`.
