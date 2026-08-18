---
name: prosewire-package-release
description: Release and verify Prosewire's public npm SDK, CLI, and MCP packages through Changesets and trusted publishing. Use when asked to publish packages or verify a published package surface.
---

# Prosewire Package Release

Release only with explicit authorization. Inspect `.github/workflows/release.yml` as the source of truth.

1. Check repository state, fetch the remote, run `pnpm changeset status --verbose`, and confirm exact packages, bump types, and expected versions.
2. Ensure public behavior changes have the smallest accurate changeset and targeted checks pass.
3. Merge only when requested, confirm the GitHub merge state, then dispatch the release workflow from `main`.
4. Monitor build, trusted npm publication, version commit, and GitHub release creation before retrying failures.
5. Verify every expected version with `npm view`, confirm releases and the version commit, and execute the published CLI/MCP or import the published SDK surface that motivated the release.

Report packages, versions, PR state, workflow result, release commit, live surface verification, and any exact gap. Local workspace behavior is not proof of publication.
