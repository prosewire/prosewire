# `@prosewire/sdk`

Typed clients for Prosewire's authenticated management API and public content API.

The package is pre-1.0. Pin a compatible version and review the changelog before upgrading.

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
const resolution = await publicContent.resolvePost("old-welcome-slug");
const redirects = await publicContent.listRedirects();
const html = await publicContent.getRendered("welcome");
```

Public clients need no key and only return published content whose publication time has arrived. `pageSize` is capped at 100. `listAllPosts` follows every page for static builds, while `resolvePost` preserves the difference between a canonical post, redirect, and 404. The deprecated `limit` option remains an alias for `pageSize`.

## Manage a publication

Create a publication-scoped API key in **Integrate → Scoped API keys** and keep it on a trusted server:

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
- `posts.revisions()` and `posts.restore()`
- `media.list()`, `media.get()`, and `media.startUpload()`
- `media.completeUpload()` and `media.delete()`

Management keys are publication-scoped. Post, revision, and media reads require `content:read`. Create, update, archive, revision restore, and media mutations require `content:write`. A restore saves the current post as a new revision before replacing it. Media deletion fails while a current post references the asset. Never expose a management key or signed upload reservation in untrusted code.

Start a managed upload with the publication UUID, filename, MIME type, and exact byte count. Send the bytes to the returned signed URL using its method and headers, then call `media.completeUpload()` with the reserved asset ID. Completion returns the sanitized variants and CDN URL.

The optional `blog` value on `posts.list()` is a safety assertion. It must match the API key's publication slug or UUID; it cannot select another publication.

For Effect applications, `createEffectClient` exposes the same operations as
typed Effects. `createClient` is the Promise-compatible facade for existing
callers; both are generated from the shared Effect HttpApi contract.

Non-success responses reject. Public-client errors include the HTTP status; management errors retain the typed Effect HTTP API failure when using `createEffectClient`.
