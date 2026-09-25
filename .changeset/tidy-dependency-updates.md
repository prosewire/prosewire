---
"@prosewire/sdk": patch
"@prosewire/cli": patch
"@prosewire/mcp": patch
"@prosewire/next": patch
---

Update Effect to 4.0.0-rc.115 across the SDK, CLI, and MCP server. Adapt CLI
arguments, flags, and MCP environment configuration to the renamed Effect
constructors while preserving existing commands and settings.

Use explicit Next.js module extensions so the published reader package can be
imported by Node.js ES module consumers.
