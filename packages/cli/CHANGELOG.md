# @prosewire/cli

## 0.4.0

### Minor Changes

- c5310e0: Add post revision history and confirmed restore operations. Restores save the current post first and are available through the dashboard, management API, SDK, CLI, and MCP server.
- 01df471: Add streamed create-only Prosewire portable imports with preview and explicit apply. Import JSON v2 plus managed original media, remap publication relationships and saved revisions, preserve slugs and dates, and default imported posts to drafts. Matching unchanged imports are safely retryable; collisions never overwrite existing content.
  
  The SDK adds `imports.run` and the Node-only `@prosewire/sdk/import-node` file helper. The CLI adds `import --data ... --media ...`, `--apply`, and `--preserve-states`. MCP adds the approval-gated `publication_import` tool. This capability requires a deployment containing the corresponding import endpoint.
- 7e23d93: Expose configured publication languages and let the server apply each publication's default language when a post create request omits its locale.
- 78fdf77: Add managed media upload, validation, processing, CDN metadata, quota, reference, deletion, and export workflows across the management clients.

### Patch Changes

- a6a9f37: Decode typed HTTP 409 post conflicts from the shared private API contract.
- 27532b0: Upgrade the published Effect-based clients and tools to Effect 4.0.0-rc.112.
- 2a46129: Propagate command interruption to management requests, public reads, file reads, and direct media uploads. An interrupted upload no longer starts its completion request.
- 93d88b7: Reject impossible calendar dates in post scheduling inputs and share post field validation with dashboard and application commands.
- 48d27cf: Update Effect to 4.0.0-rc.115 across the SDK, CLI, and MCP server. Adapt CLI
  arguments, flags, and MCP environment configuration to the renamed Effect
  constructors while preserving existing commands and settings.
  
  Use explicit Next.js module extensions so the published reader package can be
  imported by Node.js ES module consumers.
- 8528b33: Return a structured invalid-revision error when historical revision data cannot be decoded, instead of an unclassified server failure.
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

### Patch Changes

- 15bf694: Harden package documentation with corrected response shapes, complete operation boundaries, configuration details, and safer integration guidance.
- Updated dependencies [15bf694]
- Updated dependencies [433ad8b]
  - @prosewire/sdk@0.3.0

## 0.2.1

### Patch Changes

- Publish the SDK, CLI, and MCP packages through npm trusted publishing.
- Updated dependencies
  - @prosewire/sdk@0.2.1

## 0.2.0

### Patch Changes

- 31cda90: Type public content responses and pagination, add CLI update/archive commands, expose MCP create/update tools, and include package READMEs.
- 534dc86: Make publication selection explicit across public clients and CLI usage, safely encode publication paths, and expose the API-key-scoped publication to MCP clients.
- 5812cc9: Replace oRPC, Commander, and the standalone MCP SDK runtime with shared Effect HttpApi, CLI, and MCP contracts while preserving the Promise SDK facade.
- f008e80: Validate public SDK responses and CLI mutation payloads against shared schemas, and narrow CLI and MCP client dependencies to the operations they consume.
- Updated dependencies [31cda90]
- Updated dependencies [534dc86]
- Updated dependencies [5812cc9]
- Updated dependencies [f008e80]
  - @prosewire/sdk@0.2.0
