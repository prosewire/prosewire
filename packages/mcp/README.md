# `@prosewire/mcp`

An MCP server for managing a Prosewire publication through its typed API.

## Install

```sh
pnpm add --global @prosewire/mcp
```

Node.js 24 or newer is supported.

## Configure and run

Set the deployment URL and a scoped API key, then run the server over stdio:

```sh
export PROSEWIRE_API_URL=https://your-prosewire-deployment
export PROSEWIRE_API_KEY=pw_live_...
prosewire-mcp
```

Create the API key in **Settings → Developer**. The key selects one publication;
grant only `content:read` unless the client needs write tools.

The `publication_get`, `posts_list`, and `posts_get` tools are read-only.
`posts_create` and `posts_update` mutate content and require approval.
`posts_archive` is destructive, requires approval, and removes the post from
public surfaces. The server publishes those safety annotations to MCP clients;
clients should still confirm the exact mutation with the user.

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
