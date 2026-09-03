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

The `publication_get`, `posts_list`, `posts_get`, `posts_revisions_list`, and `media_list` tools are read-only.
`posts_create`, `posts_update`, `media_upload_start`, and `media_upload_complete` mutate content or storage and require approval.
`posts_revision_restore`, `posts_archive`, and `media_delete` are destructive and require approval. Restore saves the current version before applying the selected revision. Archive removes the post from public surfaces. Media deletion removes stored objects only when no current post uses the asset. The server publishes those safety annotations to MCP clients;
clients should still confirm the exact mutation with the user.

Media uploads use two tools. After `media_upload_start`, the client sends the file bytes directly to the returned signed URL using its method and headers, then calls `media_upload_complete`. The bytes do not pass through MCP.

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
