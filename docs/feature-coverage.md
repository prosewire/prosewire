# Product coverage and known gaps

This map describes behavior available on the current `main` branch. It is a
product-status reference, not a roadmap promise. A capability is marked partial
when the underlying model exists but an important user-facing workflow is still
missing.

## Authoring and editorial workflow

| Capability | Coverage |
| --- | --- |
| Draft, schedule, publish, archive, and republish | Implemented in the dashboard and management API |
| Markdown editor, live preview, excerpt, and reading time | Implemented |
| Content and search checks | Implemented as deterministic guidance; not a guarantee of ranking or accessibility compliance |
| Cover image URL and alt text | Implemented as metadata; no media library or upload workflow |
| Featured or pinned posts | Implemented as one `featured` flag used by the public homepage |
| Revisions | History browsing and confirmed restore are implemented in the dashboard, management API, SDK, CLI, and MCP; each restore first saves the version it replaces |
| Bulk operations | Bulk archive is implemented; bulk editing of other fields is not |
| Reusable snippets | Stored and visible in the content library; editor insertion UI is not implemented |
| Localization | Publication language lists, default-language selection, and post locale assignment are implemented; translation management is not |
| Import | Not implemented |

## Publishing and discovery

| Capability | Coverage |
| --- | --- |
| Public reader and author pages | Implemented with server rendering |
| Public visibility rules | Drafts, archived posts, and future scheduled posts are excluded from public surfaces |
| Slugs and redirects | Slugs are unique per publication; changing a published slug creates a permanent redirect |
| Search and categories | Implemented on the reader and public JSON list endpoint |
| Related posts and table of contents | Implemented in the public article reader |
| RSS, XML sitemap, canonical metadata, and JSON-LD | Implemented |
| Custom CSS | Implemented per publication for rendered surfaces |
| Analytics | First-party view events, overview metrics, and raw-event retention are implemented; external analytics adapters are not |

## Teams and tenancy

| Capability | Coverage |
| --- | --- |
| Workspaces and publications | Self-hosted uses one implicit team with multiple publications; Cloud supports multiple explicit workspaces; publication APIs remain isolated |
| Self-hosted administrator bootstrap | The migration job can create one administrator on an empty installation; first login requires a password change and revokes existing sessions |
| Roles | Owner, admin, editor, author, and viewer are enforced at dashboard and private API boundaries |
| Invitations | Email invitations, 48-hour expiry, acceptance, and cancellation are implemented |
| Audit history | Dashboard visibility and records for workspace, membership, publication, content, scheduler, and API-key mutations are implemented |
| Owner transfer and workspace deletion | Permission concepts exist, but complete dashboard workflows are not implemented |
| SSO and two-factor authentication | Not implemented |

## Delivery and automation

| Surface | Coverage |
| --- | --- |
| JavaScript embed | Implemented without an iframe; loads a publication index or one article |
| Rendered HTML API | Implemented with sanitized post content and stable `pw-*` classes |
| Public JSON API | Implemented for published lists and individual posts |
| Private management API | Implemented for health, publication listing, post list/get/create/update/archive, and revision list/restore |
| TypeScript SDK | Promise and Effect clients are published as pre-1.0 packages |
| CLI | Public read commands and authenticated create/update/archive commands are published |
| MCP server | Read, mutating, and destructive tools are published with operation metadata and approval requirements |
| Portable export | Versioned JSON includes publication relationships and revisions; CSV covers posts and related identifiers |

## Operations

| Capability | Coverage |
| --- | --- |
| Local development | Node.js, pnpm, and Docker workflow with migrations and development seed |
| Source-based self-hosting | Docker Compose runs Postgres, Redis with AOF persistence, a one-shot migration, web, and worker services |
| Managed infrastructure | A Compose topology is provided for an externally built image, Postgres, Redis, SMTP, and a load balancer |
| Scheduled publishing | A named Effect workflow runs the database scan and atomic publication updates; the single workflow worker recovers persisted executions after restart |
| Invitation delivery | Invitation state and a typed email intent commit together in Postgres; `LISTEN`/`NOTIFY` starts an outbox workflow immediately, a 30-second scan covers missed notifications, and an idempotent email workflow waits on Effect `DurableQueue` in Redis |
| Background workflow scaling | Workflow messages and results persist in Postgres; the pinned Effect SQL runner requires exactly one Prosewire worker process per database, with configurable in-process email concurrency |
| Backups and restore | Postgres ownership and verification steps are documented; automated offsite backups are deployment-owned |
| Stable public container | Release automation exists, but documentation does not assume registry access until a public image is independently verified |
