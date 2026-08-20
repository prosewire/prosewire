# `@prosewire/mcp`

An MCP server for managing a Prosewire publication through its typed API.

Set the deployment URL and a scoped API key, then run the server over stdio:

```sh
export PROSEWIRE_API_URL=https://content.example.com
export PROSEWIRE_API_KEY=pw_live_...
prosewire-mcp
```

The server labels read, write, and archive tools with MCP safety annotations. Clients should confirm with the user before calling mutating or destructive tools.
