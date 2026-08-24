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
  <a href="https://prosewire.com">Website</a> ·
  <a href="https://prosewire.com/docs/">Documentation</a> ·
  <a href="#why-prosewire">Why Prosewire</a> ·
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#integrate">Integrate</a> ·
  <a href="#project-status">Project Status</a> ·
  <a href="#platform">Platform</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="#license">License</a>
</p>

Prosewire is an embedded publishing platform for teams that want a capable blog without rebuilding their existing site around a traditional CMS. Authors get a focused editorial dashboard; readers get server-rendered pages; developers can choose a JavaScript embed, rendered HTML, public JSON, or a typed TypeScript client.

The entire stack is portable and Apache-2.0 licensed. Run it locally, self-host it, customize the reader, and export your content whenever you need it.

## Why Prosewire

**Built for publishing.** Draft, schedule, revise, localize, organize, and archive content from one editorial workspace. Deterministic content and search checks stay beside the draft instead of hiding in a separate tool.

**Fits the site you already have.** Add a complete reader with one script, fetch rendered HTML, or build a native experience in Next.js, Astro, or another framework with the public API and SDK.

**Portable by design.** Content, authors, categories, redirects, and metadata live in your Postgres database and remain exportable. Custom CSS lets the reader belong to your product instead of a third-party template.

**Ready for people and agents.** The dashboard, API, SDK, CLI, and MCP server share the same publishing model. API keys are scoped, mutations are audited, and destructive agent tools are clearly marked.

## Features

- **Editorial workflow** — drafts, scheduled publishing, featured posts, archives, saved revisions, reusable snippets, authors, credentials, categories, and localization
- **Writing experience** — Markdown formatting controls, live preview, cover-image metadata, reading time, and deterministic content checks
- **Discovery** — canonical URLs, automatic slug redirects, search, related posts, table of contents, RSS, XML sitemap, and JSON-LD
- **Reader experience** — server-rendered blog and author pages, reading progress, view events, and custom CSS
- **Integration surfaces** — headless Next.js and Astro readers, a safe scaffolding CLI, JavaScript embed without an iframe, rendered HTML, public JSON, TypeScript SDK, CLI, and MCP server
- **Operations** — Better Auth sessions, scoped hashed API keys, audit records, portable JSON and CSV exports, Postgres 17, Redis-backed Effect queues, and Docker Compose

See [the product coverage map](docs/feature-coverage.md) for implemented behavior, partial workflows, and known gaps.

## Quick Start

Requires Node.js 24+, pnpm 11+, and Docker.

```bash
git clone https://github.com/prosewire/prosewire.git
cd prosewire
cp .env.example .env
pnpm install
pnpm dev:services
pnpm dev
```

Open <http://localhost:3000>. In development, the first web boot runs the committed Drizzle migrations and seeds a local workspace, publication, author, and sample posts.

Sign in with `admin@prosewire.local` and `prosewire-local-dev`. These values come from `.env.example` and are intentionally local-only. Replace the database password, authentication secret, administrator email, and administrator password before using the configuration outside local development.

To provision an initial development API key, set `PROSEWIRE_SEED_API_KEY` to a unique value of at least 24 characters before the first boot. Prosewire stores its hash and grants explicit `content:read` and `content:write` scopes.

For the complete local walkthrough, shutdown command, and production distinction, read [Run Prosewire locally](https://prosewire.com/docs/getting-started/). Production deployments use the one-shot migration process and do not run the development seed.

## Integrate

### Next.js or Astro in five minutes

Run the scaffolder inside an existing project. It detects Next.js App Router, Next.js Pages Router, or Astro and writes thin native routes. In a monorepo, run it from the workspace root; it selects a single supported app automatically or accepts `--cwd apps/web` when there are several.

```bash
pnpm create prosewire@latest \
  --url https://your-prosewire-deployment \
  --blog fieldnotes \
  --route /blog
```

The framework packages ship semantic `pw-*` markup with no stylesheet or client runtime. Style the hooks, replace the typed render components, or use the public client directly. Pass `--agent` to print the setup instructions for a coding agent without changing files.

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

const posts = await content.listPosts({ page: 1, pageSize: 10 });
const article = await content.getPost("shipping-with-confidence");
```

Public content is also available directly from `/api/public/:blog/posts`, while `/api/rendered/:blog/:path` returns sanitized HTML.

Start with the [integration documentation](https://prosewire.com/docs/integrate/), or go directly to the package documentation for [Next.js](packages/next/README.md), [Astro](packages/astro/README.md), the [SDK](packages/sdk/README.md), [CLI](packages/cli/README.md), or [MCP server](packages/mcp/README.md).

## Project Status

The public SDK, CLI, and MCP packages are on the `0.2.x` release line. Prosewire is usable, but its public contracts may still change before `1.0`. Pin package and container versions, review changelogs before upgrading, and back up Postgres before applying migrations.

The repository does not currently provide a dashboard workflow for revision restore, content import, owner transfer, or workspace deletion. Those gaps are called out in the [product coverage map](docs/feature-coverage.md) instead of being presented as finished behavior.

## Platform

Prosewire keeps its product surfaces in one TypeScript monorepo:

```text
apps/web           Next.js 16 dashboard, auth, APIs, embed, and public reader
apps/site          Astro landing page and MDX documentation
apps/worker        Effect scheduled jobs and Redis-backed email delivery worker
packages/db        Postgres 17 schema and Drizzle migrations
packages/core      Rendering, sanitization, slugs, reading time, and SEO checks
packages/contract  Effect Schema and HttpApi contract
packages/sdk       Typed private API and public-content clients
packages/next      Headless App Router and Pages Router readers
packages/astro     Static and server-rendered Astro integration
packages/create-prosewire  Framework detection and safe route scaffolding
packages/cli       Command-line publishing client
packages/mcp       Agent-facing MCP server
packages/config    Shared TypeScript and ESLint configuration
```

Useful development commands:

```bash
pnpm dev
pnpm dev:web
pnpm dev:site
pnpm db:studio
pnpm lint
pnpm typecheck
pnpm test
pnpm test:docs
pnpm build
```

## Contributing

1. Fork the repository and branch from `main`.
2. Run `pnpm install`; Lefthook installs automatically.
3. Make your change and run the relevant quality gates; documentation changes should run `pnpm test:docs`.
4. Add a Changeset when public SDK, CLI, or MCP behavior changes.
5. Open a pull request.

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before making changes. Releases are never implicit.

## License

[Apache-2.0](./LICENSE)
