---
"@prosewire/sdk": minor
"@prosewire/cli": minor
"@prosewire/mcp": minor
---

Add streamed create-only Prosewire portable imports with preview and explicit apply. Import JSON v2 plus managed original media, remap publication relationships and saved revisions, preserve slugs and dates, and default imported posts to drafts. Matching unchanged imports are safely retryable; collisions never overwrite existing content.

The SDK adds `imports.run` and the Node-only `@prosewire/sdk/import-node` file helper. The CLI adds `import --data ... --media ...`, `--apply`, and `--preserve-states`. MCP adds the approval-gated `publication_import` tool. This capability requires a deployment containing the corresponding import endpoint.
