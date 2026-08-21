# @prosewire/sdk

## 0.2.0

### Patch Changes

- 31cda90: Type public content responses and pagination, add CLI update/archive commands, expose MCP create/update tools, and include package READMEs.
- 534dc86: Make publication selection explicit across public clients and CLI usage, safely encode publication paths, and expose the API-key-scoped publication to MCP clients.
- 5812cc9: Replace oRPC, Commander, and the standalone MCP SDK runtime with shared Effect HttpApi, CLI, and MCP contracts while preserving the Promise SDK facade.
- f008e80: Validate public SDK responses and CLI mutation payloads against shared schemas, and narrow CLI and MCP client dependencies to the operations they consume.
