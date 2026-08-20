<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Prosewire UI rules

- Public content must remain readable without JavaScript; enhancement is progressive.
- Dashboard mutations require an authenticated session and create an audit record.
- Keep public HTML semantic and preserve stable `pw-*` classes for embed consumers.
- Test dashboard and public-reader changes at desktop and mobile widths.
- Do not put fabricated testimonials, analytics, or customer logos into product surfaces.
