# `@prosewire/mcp`

An MCP server for managing a Prosewire publication through its typed API.

The package is pre-1.0 and requires Node.js 24 or newer. Pin a compatible version and review the changelog before upgrading.

Full guide: [Connect the MCP server](https://prosewire.com/docs/integrate/mcp/)

## Install

```sh
pnpm add --global @prosewire/mcp
```

## Configure and run

Set the deployment URL and a scoped API key, then run the server over stdio:

```sh
export PROSEWIRE_API_URL=https://your-prosewire-deployment
export PROSEWIRE_API_KEY=pw_live_...
prosewire-mcp
```

Create the API key in **Integrate → Scoped API keys**. The key selects one publication;
grant only `content:read` unless the client needs write tools.

The `publication_get`, `posts_list`, `posts_get`, and `posts_revisions_list` tools are read-only.
`posts_create` and `posts_update` mutate content and require approval.
`posts_revision_restore` and `posts_archive` are destructive and require approval. Restore saves the current version before applying the selected revision. Archive removes the post from public surfaces. The server publishes those safety annotations to MCP clients;
clients should still confirm the exact mutation with the user.

The key fixes the server to one publication. The optional `blog` argument on `posts_list` must match that publication's slug or UUID and cannot broaden the boundary. Grant `content:write` only when create, update, or archive tools are required.

## MCP client configuration

```json
{
  "mcpServers": {
    "prosewire": {
      "command": "prosewire-mcp",
      "env": {
        "PROSEWIRE_API_URL": "https://your-prosewire-deployment",
        "PROSEWIRE_API_KEY": "pw_live_..."
      }
    }
  }
}
```

Do not commit MCP client configuration containing a real API key.

Restart the MCP client after changing configuration. To diagnose startup failures, run `prosewire-mcp` in a shell with the same environment and verify the deployment URL and key without printing the key.
