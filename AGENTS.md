# Prosewire

Prosewire is an open-source, self-hostable publishing platform for teams that
need an editorial workspace without surrendering their content or frontend. It
ships a dashboard, public readers, APIs, framework integrations, an SDK, a CLI,
and an MCP server from one TypeScript monorepo.

The product should feel native inside the site that adopts it. Prosewire owns
the publishing model and reliable delivery of content; the host product keeps
control of its design, deployment, and data.

## Product principles

### Embedded, not imposed

The public reader is one integration option, not the product boundary. Rendered
HTML, public JSON, the JavaScript embed, Next.js and Astro packages, and the SDK
must all remain first-class ways to publish. Framework integrations emit
semantic, unstyled markup with stable `pw-*` hooks so adopters can make the
reader belong to their own product.

### Portable by default

Content lives in the operator's PostgreSQL database and remains exportable in a
documented format. Self-hosting is a real deployment mode, not a demo path.
Avoid designs that make content, authentication, or routine operations depend
on an undeclared Prosewire-hosted service.

### One publishing model

The dashboard, API, SDK, CLI, MCP server, worker, and framework readers describe
the same posts, permissions, lifecycle, and errors. A capability implemented on
one surface is incomplete when another affected surface silently behaves
differently.

### Safe editorial operations

Publishing changes public information. Draft visibility, scheduled time,
revisions, redirects, tenancy, audit records, and destructive actions are core
correctness concerns. Prefer a smaller feature with explicit states over a
convenient path that can leak or lose content.

## Maintainer mindset

Favor simple systems whose behavior is easy to predict. Understand the content
flow before adding machinery, and keep changes at the narrowest boundary that
fully solves the problem. Existing complexity is not a reason to preserve it;
novel architecture is not a reason to add it.

These are strong defaults, not a substitute for the user's request. The latest
explicit scope, exclusions, tools, and finish line take precedence. A review,
investigation, or proposal does not authorize implementation, and repository
work does not authorize a merge, release, deployment, publication, or external
resource change.

## Glossary

- **workspace** — a team and its membership boundary.
- **publication** — the user-facing content site managed inside a workspace;
  some internal database and API names still call it a blog.
- **post** — a versioned content item moving through draft, scheduled,
  published, and archived states.
- **management surface** — an authenticated path that can see or mutate private
  publication data: dashboard, private API, SDK, CLI, or MCP.
- **public surface** — an unauthenticated reader, feed, sitemap, embed, rendered
  endpoint, public API, or framework integration.
- **reader** — the HTML experience that lists or displays published posts.
- **revision** — the snapshot captured before a destructive content change.
- **redirect** — the durable mapping from an old public slug to its canonical
  replacement.
- **management key** — a hashed, publication-scoped API credential with explicit
  read or write scopes.

## Common ways to break Prosewire

1. **Fixing one surface only.** Updating the dashboard or API without tracing
   the SDK, CLI, MCP, readers, documentation, tests, and Changesets creates
   several versions of the product contract.
2. **Leaking unpublished content.** Public queries must exclude drafts,
   archives, and scheduled posts whose publication time has not arrived. Apply
   the rule to lists, detail pages, search, related posts, RSS, sitemap,
   rendered HTML, JSON, and integrations.
3. **Losing history or URLs.** Create the revision before destructive content
   changes. Slugs are unique per publication, and changing one must preserve the
   old public URL through a redirect.
4. **Crossing tenancy boundaries.** Sessions, membership, API keys, post IDs,
   author IDs, and category IDs must resolve inside the same authorized
   workspace and publication.
5. **Treating asynchronous writes as optional.** Required audit entries,
   scheduled publication updates, and queue writes must be awaited or explicitly
   observed. Test retries, concurrent edits, and transaction failures.
6. **Hiding writes inside reads.** Queries and public reads perform no
   persistence. Record analytics through an explicit event operation rather than
   as a side effect of fetching content.
7. **Publishing unsafe rich content.** Sanitize Markdown and rich content before
   it reaches the reader, rendered API, embed, Next.js, or Astro output.
8. **Mishandling secrets.** Encrypt credentials that must be recovered later,
   hash API keys and tokens, never log secret values, and never expose a
   management key to browser code.
9. **Testing against the wrong system.** Development seeds are local-only.
   Inspect the deployment, process, database, workflow, and configuration that
   actually control the requested behavior before claiming a production result.

## Check every affected surface

Before calling a product behavior complete, decide which of these apply:

- **Domain and persistence:** content rules, authorization, PostgreSQL schema,
  migrations, revisions, redirects, audits, and transactions.
- **Web boundaries:** dashboard actions, private API, public API, rendered API,
  reader pages, embed, RSS, sitemap, JSON-LD, and exports.
- **Published clients:** `@prosewire/sdk`, `@prosewire/cli`, `@prosewire/mcp`,
  `@prosewire/next`, `@prosewire/astro`, and `create-prosewire`.
- **Background work:** scheduled publishing, analytics retention, Redis queues,
  email delivery, retries, and shutdown.
- **Product record:** documentation, feature coverage, tests, package
  changelogs, and Changesets.

Prefer a shared implementation and shared contract tests when multiple surfaces
promise the same behavior.

## Development

- `pnpm install --frozen-lockfile` installs the workspace.
- `pnpm dev:services` starts the local PostgreSQL and Redis services.
- `pnpm dev` runs the development workspaces; `pnpm dev:web` and
  `pnpm dev:site` run narrower surfaces.
- Development may migrate and seed a local database. Production uses the
  one-shot migration path and never relies on development seed identities.
- Do not stop, replace, or reconfigure an existing process until you identify
  the process and confirm it belongs to this worktree.

## Verification

- Use the smallest proof appropriate to the change: focused Vitest files,
  package tests, database tests, typecheck, lint, build, or Playwright acceptance
  coverage.
- Test domain services with test Layers and transport adapters at their own
  boundaries. Use controlled clocks rather than real sleeps for time-dependent
  behavior.
- Database changes need migration tests and a documented production recovery
  path before they are treated as deployable.
- Public-content changes need direct checks for draft, future scheduled,
  published, archived, renamed, and missing posts on every affected public path.
- Dashboard and reader UI changes should be inspected at desktop and mobile
  widths through the rendered application.
- A green build is not evidence of a release, deployment, migration, or public
  registry result. Verify the requested live artifact or surface explicitly.

## Pull requests and releases

- Use the authenticated GitHub CLI (`gh`) for GitHub operations.
- Do not create or merge a pull request unless explicitly requested.
- Keep one coherent concern in a pull request and preserve unrelated worktree
  changes.
- Public package behavior changes require an accurate Changeset.
- Treat `.github/workflows/release.yml`,
  `.github/workflows/release-image.yml`, package manifests, and release scripts
  as the current release specification; fetch the remote before assessing them.
- Never retry publication blindly after a registry may have accepted a version.
  Query the registry state first and never attempt to overwrite an accepted
  version.

## How the system fits together

Next.js routes and server actions are transport boundaries. They parse framework
inputs and call Promise-returning entrypoints backed by one process-owned Effect
runtime. Application services express publishing, access, workspace, and export
capabilities; infrastructure implementations use Drizzle and PostgreSQL.

This repository uses Effect 4 RC. Verify APIs against the installed version
instead of applying remembered Effect 3 patterns. Authorization services expose
business intent such as publication read, post write, or administration;
callers do not pass role arrays or reimplement role policy.

The shared Effect Schema and HttpApi contract drives the private API and typed
SDK. The CLI and MCP server build on that SDK. The Next.js and Astro packages
build public readers on the public client. The worker owns scheduled publishing,
analytics retention, and Redis-backed email processing.

Keep framework and transport types at the boundary. Application services accept
branded domain identities and return transport-neutral models. Build a managed
runtime once per process, with migration and seed work isolated in a short-lived
bootstrap runtime.

Next.js can evaluate server modules in multiple bundles, so the web runtime must
use the existing `globalThis` registry keyed by `Symbol.for`; a module-level
singleton alone is insufficient. Keep migrations and seeds out of request
runtimes, coordinate multi-replica bootstrap with the existing database-backed
lock, dispose the bootstrap runtime when it finishes, and never run development
seeds against production.

Do not install competing `SIGINT` or `SIGTERM` handlers in the framework-owned
web process. The standalone worker owns and tests its own shutdown lifecycle.

## Where code lives

- `apps/web` — Next.js dashboard, auth, APIs, embed, exports, and public reader.
- `apps/site` — Astro marketing site and MDX documentation.
- `apps/worker` — scheduled and queued background work.
- `packages/core` — rendering, sanitization, permissions, SEO, and content types.
- `packages/db` — PostgreSQL schema, migrations, client, and test utilities.
- `packages/contract` — Effect schemas, transport models, and private HttpApi.
- `packages/jobs` — Redis configuration and persisted queues.
- `packages/sdk` — typed management and public-content clients.
- `packages/next` and `packages/astro` — headless framework readers.
- `packages/create-prosewire` — framework detection and safe route scaffolding.
- `packages/cli` — command-line publishing client.
- `packages/mcp` — agent-facing MCP server.
- `packages/config` — shared TypeScript configuration.
- `docs/feature-coverage.md` — source of truth for implemented, partial, and
  missing product behavior.

## Taste

- Make editorial state obvious. Do not invent status, analytics, customers, or
  success claims for product surfaces.
- Keep public HTML semantic, progressively enhanced, and readable without
  JavaScript. Preserve stable `pw-*` classes for adopters.
- Put complexity in adapters and infrastructure, not in framework components or
  pure content logic.
- Prefer business capabilities over generic database helpers and typed domain
  errors over catch-all failures.
- Comments explain contracts and non-obvious constraints, not line-by-line code.
- If a repository default conflicts with the requested task, surface the
  conflict before making the exception.
