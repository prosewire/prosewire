# `@prosewire/cli`

Command-line access to Prosewire public content and publishing operations.

The package is pre-1.0 and requires Node.js 24 or newer. Pin a compatible version and review the changelog before upgrading.

Full guide: [Automate publishing with the CLI](https://prosewire.com/docs/integrate/cli/)

## Install

```sh
pnpm add --global @prosewire/cli
prosewire --help
```

## Configure and use

```sh
export PROSEWIRE_API_URL=https://your-prosewire-deployment
export PROSEWIRE_BLOG=fieldnotes
prosewire posts --search portable
prosewire get welcome

export PROSEWIRE_API_KEY=pw_live_...
prosewire create --data post.json
prosewire update 00000000-0000-4000-8000-000000000000 --data changes.json
prosewire archive 00000000-0000-4000-8000-000000000000 --yes
```

`--url`, `--blog`, and `--key` override the corresponding environment variables. The URL defaults to `http://localhost:3000`; public commands still require a publication slug through `--blog` or `PROSEWIRE_BLOG`.

`posts` and `get` are read-only and use the public content API. `create` and
`update` mutate content and require `PROSEWIRE_API_KEY` (or `--key`). `archive`
is destructive, requires a write-scoped key, and refuses to run without `--yes`.
Create keys in **Integrate → Scoped API keys** and avoid shell history or committed
environment files when supplying them.

`create --data` expects a JSON object with `blogId`, `authorId`, `title`, and `slug`; other fields follow the management post-create contract. `update <id> --data` accepts a partial post object. Both identifiers are UUIDs. The current management API does not expose a standalone author-list endpoint, so resolve author IDs from an existing authenticated post response or portable export.

Commands write formatted JSON to standard output. Treat that output as potentially containing unpublished content when using private commands.

The executable is defined with Effect CLI and uses typed, interruptible command handlers.
