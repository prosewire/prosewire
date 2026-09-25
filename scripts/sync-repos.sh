#!/usr/bin/env sh
# Checks out the gitignored Effect reference at the pinned `effect` version.
# A new worktree first copies the main checkout's .repos. `--latest` uses main.
set -eu

dir=.repos/effect-smol
ref="effect@$(node -p 'require("./packages/contract/package.json").dependencies.effect')"
[ "${1:-}" = --latest ] && ref=main

main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
[ ! -e .repos ] && [ -d "$main/.repos" ] && cp -R "$main/.repos" .repos

if [ -d "$dir/.git" ]; then
  git -C "$dir" fetch --depth=1 origin "$ref"
  git -C "$dir" checkout --detach FETCH_HEAD
else
  # Fails rather than overwriting a non-clone directory.
  git clone --depth=1 --branch "$ref" https://github.com/Effect-TS/effect.git "$dir"
fi
