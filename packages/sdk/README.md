# `@prosewire/sdk`

Typed clients for Prosewire's authenticated management API and public content API.

```ts
import { createClient, createPublicClient } from "@prosewire/sdk";

const management = createClient({
  baseUrl: "https://content.example.com",
  apiKey: process.env.PROSEWIRE_API_KEY,
});

const publicContent = createPublicClient({
  baseUrl: "https://content.example.com",
  blog: "fieldnotes",
});

const page = await publicContent.listPosts({ page: 1, pageSize: 20 });
const drafts = await management.posts.list({ status: "draft" });
```

Keep management API keys on trusted servers. Public clients do not require a key.

For Effect applications, `createEffectClient` exposes the same operations as
typed Effects. `createClient` is the Promise-compatible facade for existing
callers; both are generated from the shared Effect HttpApi contract.
