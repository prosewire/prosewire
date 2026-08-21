# @prosewire/mcp

## 0.2.1

### Patch Changes

- Publish the SDK, CLI, and MCP packages through npm trusted publishing.
- Updated dependencies
  - @prosewire/sdk@0.2.1

## 0.2.0

### Minor Changes

- 5812cc9: Replace oRPC, Commander, and the standalone MCP SDK runtime with shared Effect HttpApi, CLI, and MCP contracts while preserving the Promise SDK facade.

### Patch Changes

- 31cda90: Type public content responses and pagination, add CLI update/archive commands, expose MCP create/update tools, and include package READMEs.
- 534dc86: Make publication selection explicit across public clients and CLI usage, safely encode publication paths, and expose the API-key-scoped publication to MCP clients.
- f008e80: Validate public SDK responses and CLI mutation payloads against shared schemas, and narrow CLI and MCP client dependencies to the operations they consume.
- Updated dependencies [31cda90]
- Updated dependencies [534dc86]
- Updated dependencies [5812cc9]
- Updated dependencies [f008e80]
  - @prosewire/sdk@0.2.0
