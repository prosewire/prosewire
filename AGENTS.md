# Prosewire Agent Instructions

## Task boundaries

- Treat the latest explicit correction as authoritative.
- Preserve the requested mode: a review, investigation, or proposal does not authorize implementation.
- Follow named scope, exclusions, tools, PR structure, and finish line literally.
- Do not merge, release, deploy, publish packages, or create external resources unless explicitly requested.
- Compare the delivered result with every acceptance criterion and disclose deliberate deviations.

## Current state

- Fetch current remote state before assessing repository readiness when a remote exists.
- Do not validate against a stale checkout without identifying it as stale.
- Inspect the workflow, package, deployment, and configuration that actually control the requested behavior.

## GitHub operations

- Use the authenticated GitHub CLI (`gh`) for repository operations such as issues, pull requests, checks, releases, and settings.

## Feature completeness

For product behavior changes, audit every affected surface:

- Core domain logic
- Database and migrations
- Router, rendered API, and raw API
- Dashboard and embeddable reader
- TypeScript SDK
- CLI
- MCP
- Documentation
- Tests
- Changesets

Do not assume support on one surface implies support elsewhere. Prefer shared implementations and shared contract tests.

## Domain invariants

Test the complete content flow across:

- Draft, scheduled, published, archived, and restored posts
- Slug creation, redirects, canonical URLs, search, RSS, sitemap, and JSON-LD
- Authors, categories, localization, snippets, related posts, and pinned posts
- Raw API, rendered API, JavaScript embed, SDK, CLI, and MCP
- First requests, retries, concurrent edits, and failed transactions

The following rules apply globally:

- Read-only operations perform no persistence.
- Public queries only return published content whose publication time has arrived.
- Revisions are created before destructive content changes.
- Slugs are unique per blog and old public URLs redirect after a slug change.
- Required audit and background writes are awaited or explicitly observed.
- Secrets needed later are encrypted, not irreversibly hashed; API tokens are stored as hashes.
- Rich content is sanitized before it reaches public rendered surfaces.
- Content remains exportable in a documented, portable format.

## Scope discipline

- Keep changes at the narrowest correct boundary.
- Do not modify shared UI primitives for a consumer-specific issue.
- Do not add migrations, defaults, labels, abstractions, or generated assets unless required.
- If a safe narrow result is useful, deliver it and identify what remains unverified.

## UI and visual work

- Inspect the existing product and assets before redesigning.
- Derive visuals from real authoring, review, publishing, SEO, analytics, and integration flows.
- Avoid fake status overlays, excessive glow, pill-heavy layouts, repetitive floating cards, and generic SaaS mockups.
- Inspect visual work on desktop and mobile through the rendered URL before presenting it as complete.

## Documentation and product copy

- Organize documentation around publishing outcomes before integration, deployment, operations, troubleshooting, and reference.
- Keep community and launch copy brief, personal, and concrete.
- Position Prosewire as an open-source, self-hostable embedded publishing platform with original product copy and design.

## Releases

Do not release packages or images unless explicitly requested.

- For SDK, CLI, or MCP releases, use the `$prosewire-package-release` skill.
- For stable Docker images, use the `$prosewire-image-release` skill.

A release is incomplete until the published artifact and its public surface have been verified.

<!-- effect-solutions:start -->
## Effect architecture

**IMPORTANT:** Consult `effect-solutions` before writing or changing Effect code. This repository uses Effect 4 RC APIs; do not rely on remembered Effect 3 patterns.

1. Run `effect-solutions list`.
2. Run `effect-solutions show <topic>...` for every relevant topic. At minimum, use `services-and-layers`, `data-modeling`, `error-handling`, and `testing` for application work.
3. Search `~/.local/share/effect-solutions/effect` for current implementations and type definitions when the guides are insufficient.
4. Use the opencode repository as an application-architecture reference, then verify every API against the installed Effect version.

Available topics include `quick-start`, `project-setup`, `tsconfig`, `basics`, `services-and-layers`, `data-modeling`, `error-handling`, `config`, `testing`, and `cli`.

### Project boundaries

- Next.js framework files under `apps/web/src/app`, React components, and files with `"use server"` must not import `effect`, construct Effects, provide Layers, or interpret Effect failures. They parse framework inputs, call Promise-returning entrypoints, and translate results into redirects, revalidation, or responses.
- Keep `Request`, `Response`, `Headers`, `FormData`, Next.js navigation/cache APIs, BullMQ jobs, and other transport types in boundary adapters. Domain and application services accept branded domain values and return transport-neutral models.
- Create one long-lived managed runtime per process in a dedicated runtime module. Build and provide the complete Layer graph once. Never create a runtime, open a database, or assemble Layers per request, route, service method, or job.
- In framework builds, a module-level singleton is not enough: server bundlers can evaluate the runtime module in multiple chunks. Store process-owned runtimes in a `globalThis` registry keyed with `Symbol.for`, and inspect the production bundle when changing runtime wiring.
- Keep migrations and seed work in a short-lived bootstrap runtime outside the request Layer graph. Serialize multi-instance bootstrap with a database-backed lock, and dispose the bootstrap runtime after it completes.
- Do not install competing `SIGINT` or `SIGTERM` handlers inside framework-owned processes. Let the framework own graceful shutdown unless it exposes an explicit lifecycle hook that can dispose the runtime without racing shutdown.
- Application code depends on capabilities, not a generic database helper. Database clients and generic `execute` methods are infrastructure details used only inside service implementations. Never restore catch-all modules such as `server/data.ts` or `server/effect.ts`.

### Services and models

- Put one primary `Context.Service` capability in each service module. Export its `Interface`, `Service`, `layer`, and namespace re-export. Construct methods with `Effect.fn` and capture dependencies while building the Layer so service methods have `R = never`.
- Name services and methods after business capabilities such as `Publishing.savePost`, `BlogAccess.requirePostWrite`, or `PostExport.csv`. Do not wrap pure formatting, parsing, browser lifecycle code, or ordinary Promise APIs in a service merely to make them use Effect.
- Authorization services expose intent-level operations. Callers request `read`, `post write`, or `admin`; callers never supply role arrays or decide which roles qualify.
- Define external inputs and persistent identities with `Schema`, `Schema.Class`, and branded IDs. Convert strings at boundaries and keep brands through service APIs; do not pass raw `string` IDs through the domain.
- Colocate tagged errors with the capability that owns them and include typed context such as `PostId` or `BlogId`. Translate low-level database/integration errors at the owning service or outer boundary. Do not use global generic `ValidationError`, `NotFoundError`, `UnauthorizedError`, or `ForbiddenError` classes.
- Use Effect-native `Config`, `Clock`, `DateTime`, `Redacted`, resource scopes, retry/scheduling, and interruption where those concerns exist. Do not hide `Date.now`, environment reads, timers, or uninterruptible async work inside service implementations.

### Testing and review

- Test service behavior by providing test Layers or `Layer.mock`; test transport adapters separately. Assert domain errors and capabilities, not implementation helpers. Never use real sleeps when `TestClock` can control time.
- Before finishing, run the relevant typecheck, lint, and tests, then audit boundaries with searches equivalent to:
  - `rg "from ['\\\"]effect['\\\"]|Effect\\.|Layer\\.|ManagedRuntime" apps/web/src/app apps/web/src/components`
  - `rg 'ManagedRuntime.make|Effect.runPromise' apps/web/src apps/worker/src`
  - `rg 'Request|Response|Headers|FormData' apps/web/src/server`
- Treat unexpected matches as architectural findings and either fix them or document why the file is an intentional runtime or transport boundary.
<!-- effect-solutions:end -->
