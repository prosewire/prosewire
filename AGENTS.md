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
