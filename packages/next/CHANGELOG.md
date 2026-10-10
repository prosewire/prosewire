# `@prosewire/next`

## 0.3.1

### Patch Changes

- 7698c82: Add article Open Graph, social card, and richer BlogPosting metadata to the framework readers.
- 3986e4b: Fix production Pages Router builds for publications with renamed posts. Prebuild only canonical post slugs and resolve old slugs through blocking fallback, preserving permanent redirects without returning redirect props during prerendering.
- 48d27cf: Update Effect to 4.0.0-rc.115 across the SDK, CLI, and MCP server. Adapt CLI
  arguments, flags, and MCP environment configuration to the renamed Effect
  constructors while preserving existing commands and settings.
  
  Use explicit Next.js module extensions so the published reader package can be
  imported by Node.js ES module consumers.
- Updated dependencies [a6a9f37]
- Updated dependencies [27532b0]
- Updated dependencies [c5310e0]
- Updated dependencies [01df471]
- Updated dependencies [7e23d93]
- Updated dependencies [99a284f]
- Updated dependencies [93d88b7]
- Updated dependencies [78fdf77]
- Updated dependencies [48d27cf]
- Updated dependencies [8528b33]
  - @prosewire/sdk@0.4.0

## 0.3.0

### Minor Changes

- 433ad8b: Add first-class, headless Next.js and Astro readers, monorepo-aware framework scaffolding, and public redirect resolution for static and server-rendered integrations.

### Patch Changes

- Updated dependencies [15bf694]
- Updated dependencies [433ad8b]
  - @prosewire/sdk@0.3.0

## 0.2.1

### Minor changes

- Add headless App Router and Pages Router readers with metadata, ISR, redirects, and replaceable page components.
