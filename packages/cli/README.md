# `@prosewire/cli`

Command-line access to Prosewire public content and publishing operations.

## Install

```sh
pnpm add --global @prosewire/cli
prosewire --help
```

Node.js 24 or newer is supported.

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

`posts` and `get` are read-only and use the public content API. `create` and
`update` mutate content and require `PROSEWIRE_API_KEY` (or `--key`). `archive`
is destructive, requires a write-scoped key, and refuses to run without `--yes`.
Create keys in **Settings → Developer** and avoid shell history or committed
environment files when supplying them.

The executable is defined with Effect CLI and uses typed, interruptible command handlers.
