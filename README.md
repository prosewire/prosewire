<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/final/prosewire-mark-on-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="assets/brand/final/prosewire-mark-on-light.svg" />
    <img src="assets/brand/final/prosewire-mark-on-light.svg" alt="Prosewire" width="140" />
  </picture>
</p>

<h1 align="center">Prosewire</h1>

<p align="center">
  <strong>Open-source, self-hostable publishing that fits into any website.</strong>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-EF6848?style=flat-square" alt="Apache-2.0 License" /></a>
  <img src="https://img.shields.io/badge/Node.js-24%2B-172329?style=flat-square" alt="Node.js 24 or newer" />
  <img src="https://img.shields.io/badge/pnpm-11%2B-172329?style=flat-square" alt="pnpm 11 or newer" />
</p>

<p align="center">
  <a href="https://prosewire-site.akntech.workers.dev">Website</a> ·
  <a href="https://prosewire-site.akntech.workers.dev/docs/">Docs</a> ·
  <a href="#why-prosewire">Why Prosewire</a> ·
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#integrate">Integrate</a> ·
  <a href="#platform">Platform</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="#license">License</a>
</p>

Prosewire is an embedded publishing platform for teams that want a serious blog without rebuilding their existing site around a traditional CMS. Authors get a focused editorial dashboard; readers get fast, server-rendered pages; developers can choose a JavaScript embed, rendered HTML, public JSON, or a typed TypeScript client.

The entire stack is portable and Apache-2.0 licensed. Run it locally, self-host it, customize the reader, and export your content whenever you need it.

## Why Prosewire

**Built for publishing.** Draft, schedule, revise, localize, organize, and archive content from one editorial workspace. SEO and AI-discovery checks are part of the writing flow rather than an afterthought.

**Fits the site you already have.** Add a complete reader with one script, fetch rendered HTML, or build a native experience in Next.js, Astro, or another framework with the public API and SDK.

**Portable by design.** Content, authors, categories, redirects, and metadata live in your Postgres database and remain exportable. Custom CSS lets the reader belong to your product instead of a third-party template.

**Ready for people and agents.** The dashboard, API, SDK, CLI, and MCP server share the same publishing model. API keys are scoped, mutations are audited, and destructive agent tools are clearly marked.

## Features

- **Editorial workflow** — drafts, scheduled publishing, featured posts, archives, saved revisions, reusable snippets, authors, credentials, categories, and localization
- **Writing experience** — Markdown formatting controls, live preview, cover-image metadata, reading time, and real-time content checks
- **Discovery** — canonical URLs, automatic slug redirects, search, related posts, table of contents, RSS, XML sitemap, and JSON-LD
- **Reader experience** — server-rendered blog and author pages, reading progress, view events, and custom CSS
- **Integration surfaces** — JavaScript embed without an iframe, rendered HTML API, public JSON API, private oRPC/OpenAPI contract, TypeScript SDK, CLI, and MCP server
- **Operations** — Better Auth sessions, scoped hashed API keys, audit records, CSV export, Postgres 17, Redis/BullMQ scheduling, and Docker Compose

See [the feature coverage map](docs/feature-coverage.md) for detailed behavior and current coverage.

## Quick Start

Requires Node.js 24+, pnpm 11+, and Docker.

```bash
git clone https://github.com/prosewire/prosewire.git
cd prosewire
cp .env.example .env
# Replace the BETTER_AUTH_SECRET and ADMIN_PASSWORD placeholders in .env.
pnpm install
docker compose up -d postgres redis
pnpm dev
```

Open <http://localhost:3000>. The first boot runs the committed Drizzle migrations and seeds a local workspace.

The first boot creates the administrator from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
Both secrets are required and insecure placeholder values are rejected at startup.

To provision an initial API key, set `PROSEWIRE_SEED_API_KEY` to a unique value
of at least 24 characters before the first boot. The stored key is hashed and
receives explicit `content:read` and `content:write` scopes.

## Integrate

### JavaScript embed

Add a complete blog to an existing page without an iframe:

```html
<div data-prosewire="fieldnotes"></div>
<script
  async
  src="https://your-prosewire-deployment/embed.js"
  data-blog="fieldnotes"
></script>
```

For one article, add `data-path="article-slug"` to the script.

### TypeScript

Use the public client during a Next.js or Astro render, in a server route, or from any JavaScript runtime with `fetch`:

```ts
import { createPublicClient } from "@prosewire/sdk";

const content = createPublicClient({
  baseUrl: "https://your-prosewire-deployment",
  blog: "fieldnotes",
});

const posts = await content.listPosts({ limit: 10 });
const article = await content.getPost("shipping-with-confidence");
```

Public content is also available directly from `/api/public/:blog/posts`, while `/api/rendered/:blog/:path` returns sanitized HTML.

## Platform

Prosewire keeps its product surfaces in one TypeScript monorepo:

```text
apps/web           Next.js 16 dashboard, auth, APIs, embed, and public reader
apps/site          Astro landing page and MDX documentation
apps/worker        BullMQ scheduled-publishing worker
packages/db        Postgres 17 schema and Drizzle migrations
packages/core      Rendering, sanitization, slugs, reading time, and SEO checks
packages/contract  Zod and oRPC contract with operation-risk metadata
packages/sdk       Typed private API and public-content clients
packages/cli       Command-line publishing client
packages/mcp       Agent-facing MCP server
packages/config    Shared TypeScript and ESLint configuration
```

Useful development commands:

```bash
pnpm dev:web
pnpm db:studio
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Contributing

1. Fork the repository and branch from `main`.
2. Run `pnpm install`; Lefthook installs automatically.
3. Make your change and run the relevant quality gates.
4. Add a Changeset when public SDK, CLI, or MCP behavior changes.
5. Open a pull request.

Read [AGENTS.md](AGENTS.md) before making changes. Releases are never implicit.

## License

[Apache-2.0](./LICENSE)
