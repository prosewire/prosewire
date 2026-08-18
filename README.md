# Prosewire

Prosewire is an open-source, self-hostable publishing layer for adding a full blog to an existing website. It ships with a focused editorial dashboard, server-rendered public reader, JavaScript embed, raw and rendered APIs, TypeScript SDK, CLI, MCP server, Postgres data model, and scheduled-publishing worker.

The product direction comes from competitive feature research and recurring customer needs: easy setup, practical SEO guidance, migration support, bulk editing, portable content, and better image workflows. Prosewire addresses these needs with an original, Apache-2.0-licensed architecture.

## What works now

- Draft, scheduled, published, featured, and archived posts
- Markdown editor with formatting controls, live preview, cover image metadata, localization, and saved revisions
- Real-time SEO and AI-discovery structure checks
- Authors, credentials, categories, reusable snippets, automatic slug redirects, and bulk archive
- Server-rendered blog, author profiles, search, related posts, table of contents, RSS, XML sitemap, JSON-LD, reading progress, and view events
- JavaScript embed without an iframe, rendered HTML API, public JSON API, private oRPC/OpenAPI contract, TypeScript SDK, CLI, and MCP server
- Better Auth dashboard sessions and scoped hashed API keys
- CSV export, custom CSS, audit records, Postgres 17, Redis/BullMQ scheduling, and Docker Compose

See [docs/feature-coverage.md](docs/feature-coverage.md) for the full researched feature map and honest coverage status.

## Local development

Requirements: Node 24+, pnpm 11+, and Docker.

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres redis
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The first boot runs committed Drizzle migrations and seeds a local workspace.

Dashboard credentials:

```text
admin@prosewire.local
prosewire-local-dev
```

Local API key:

```text
pw_local_development_key
```

Change these values before sharing any deployment.

Useful commands:

```bash
pnpm dev:web       # dashboard and public reader
pnpm db:studio     # inspect Postgres with Drizzle Studio
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Embed in an existing site

```html
<div data-prosewire="fieldnotes"></div>
<script
  async
  src="http://localhost:3000/embed.js"
  data-blog="fieldnotes"
></script>
```

For one article, add `data-path="article-slug"` to the script.

## Architecture

```text
apps/web       Next.js 16 dashboard, auth, REST API, embed, public reader
apps/worker    BullMQ scheduled-publishing worker
packages/db    Postgres 17 schema and Drizzle migrations
packages/core  Content rendering, sanitization, slugs, reading time, SEO checks
packages/contract  Zod + oRPC API contract and operation-risk metadata
packages/sdk   Typed API and public-content clients
packages/cli   Command-line publishing client
packages/mcp   Agent-facing MCP server
packages/config  Shared TypeScript and ESLint rules
```

## Contributing

Read [AGENTS.md](AGENTS.md) before making changes. Public SDK, CLI, and MCP behavior needs a Changeset. Releases are never implicit.

## License

Apache-2.0
