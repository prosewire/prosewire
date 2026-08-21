# `@prosewire/sdk`

Typed clients for Prosewire's authenticated management API and public content API.

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
console.log(page.items.map((post) => post.title));
```

Public clients do not require a key. For private management operations, create a
publication-scoped API key in **Settings → Developer** and keep it on a trusted
server:

```ts
import { createClient } from "@prosewire/sdk";

const management = createClient({
  baseUrl: process.env.PROSEWIRE_API_URL!,
  apiKey: process.env.PROSEWIRE_API_KEY!,
});

const drafts = await management.posts.list({ status: "draft" });
```

For Effect applications, `createEffectClient` exposes the same operations as
typed Effects. `createClient` is the Promise-compatible facade for existing
callers; both are generated from the shared Effect HttpApi contract.
