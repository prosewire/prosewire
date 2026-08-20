# `@prosewire/cli`

Command-line access to Prosewire public content and publishing operations.

```sh
export PROSEWIRE_API_URL=https://content.example.com
export PROSEWIRE_BLOG=fieldnotes
prosewire posts --search portable
prosewire get welcome

export PROSEWIRE_API_KEY=pw_live_...
prosewire create --data post.json
prosewire update 00000000-0000-4000-8000-000000000000 --data changes.json
prosewire archive 00000000-0000-4000-8000-000000000000 --yes
```

API keys are only required for management commands. Archive requires explicit `--yes` confirmation.
