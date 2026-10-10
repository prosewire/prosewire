---
"@prosewire/next": patch
---

Fix production Pages Router builds for publications with renamed posts. Prebuild only canonical post slugs and resolve old slugs through blocking fallback, preserving permanent redirects without returning redirect props during prerendering.
