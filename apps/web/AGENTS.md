<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project uses Next.js 16. APIs, conventions, and file structure may differ from older examples. Read the relevant guide in `node_modules/next/dist/docs/` before changing framework behavior, and heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Prosewire UI rules

- Public content must remain readable without JavaScript; enhancement is progressive.
- Dashboard mutations require an authenticated session and create an audit record.
- Keep public HTML semantic and preserve stable `pw-*` classes for embed consumers.
- Test dashboard and public-reader changes at desktop and mobile widths.
- Do not put fabricated testimonials, analytics, or customer logos into product surfaces.
