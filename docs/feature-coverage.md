# Feature research and coverage

Research snapshot: 19 August 2026.

## Customer outcomes from testimonials and reviews

Public reviews consistently emphasize five outcomes:

1. A blog that is much stronger than a website builder's native blog.
2. Setup that does not require a WordPress subdomain or plugin stack.
3. Actionable SEO guidance during writing.
4. Useful author, category, scheduling, video, and product-embed workflows.
5. Responsive migration and setup help.

The most useful negative signals are equally concrete:

- Price is frequently described as steep or seriously overpriced.
- Bulk editing is a requested missing capability.
- Image placement and gallery workflows can feel awkward.

Prosewire therefore treats self-hosting, bulk operations, portable content, and image metadata as core capabilities rather than paid upgrades.

## Pricing-page inventory

| Capability | Prosewire status |
| --- | --- |
| Unlimited posts | Implemented |
| Multiple workspaces and publications | Implemented with explicit dashboard selectors and isolated public/integration surfaces |
| Multiple users and authors | Workspace membership, email invitations, and publication-specific public authors implemented |
| Fixed and granular roles | Owner, admin, editor, author, and viewer enforced at dashboard and API mutation boundaries |
| Version history and user revision tracking | Implemented |
| Audit log | Implemented for workspace, membership, publication, content, scheduler, and API-key mutations with dashboard visibility |
| Link monitoring | Planned |
| Offsite backups | Deployment concern; documented database ownership, automation planned |
| SSO | Planned adapter |
| Two-factor authentication | Better Auth foundation present; 2FA plugin planned |
| CSV export | Implemented |
| White-glove migration | Not applicable to the OSS core; import tools are planned |
| Staging environment | Supported through separate instances; dashboard workflow planned |
| AI topic planning | Planned as an optional provider integration |
| AI discovery / mention guidance | Deterministic structure checks implemented |
| Real-time SEO analyzer | Implemented |
| Text-to-speech | Planned as an optional provider integration |
| Author pages and E-E-A-T fields | Implemented |
| XML sitemap and schema | Implemented |
| Analytics dashboard | First-party view events and dashboard implemented; GA4 adapter planned |
| Reusable snippets | Data model and library implemented; editor insertion UI is next |
| CTA buttons | Markdown/HTML capable; dedicated block UI planned |
| YouTube and Vimeo | Sanitized embeds supported in rendered content |
| Product embeds | Custom HTML capable; store-specific blocks planned |
| FAQ builder | Semantic Markdown supported; dedicated FAQ block/schema planned |
| Automatic table of contents | Implemented |
| Instant search | Implemented with Postgres full-text search |
| Related posts | Implemented |
| Scheduled posts | Implemented with Redis/BullMQ |
| Pinned posts | Implemented as featured posts |
| Localization | Per-blog and per-post locale implemented; translation UI planned |
| Rich copy/paste | Plain Markdown editor today; structured paste pipeline planned |
| Template inheritance and custom CSS | Implemented through semantic classes and scoped CSS |
| Shopify / WordPress / CSV imports | Planned; CSV export is implemented |
| Zapier automation | REST API supports automation; packaged Zapier app planned |
| SDK, MCP, rendered API, raw API | Implemented |
| Bulk post operations | Bulk archive implemented; more bulk fields planned |
