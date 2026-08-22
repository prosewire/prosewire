# @prosewire/sdk

## 0.3.0

### Minor Changes

- 433ad8b: Add first-class, headless Next.js and Astro readers, monorepo-aware framework scaffolding, and public redirect resolution for static and server-rendered integrations.

### Patch Changes

- 15bf694: Harden package documentation with corrected response shapes, complete operation boundaries, configuration details, and safer integration guidance.

## 0.2.1

### Patch Changes

- Publish the SDK, CLI, and MCP packages through npm trusted publishing.

## 0.2.0

### Patch Changes

- 31cda90: Type public content responses and pagination, add CLI update/archive commands, expose MCP create/update tools, and include package READMEs.
- 534dc86: Make publication selection explicit across public clients and CLI usage, safely encode publication paths, and expose the API-key-scoped publication to MCP clients.
- 5812cc9: Replace oRPC, Commander, and the standalone MCP SDK runtime with shared Effect HttpApi, CLI, and MCP contracts while preserving the Promise SDK facade.
- f008e80: Validate public SDK responses and CLI mutation payloads against shared schemas, and narrow CLI and MCP client dependencies to the operations they consume.
