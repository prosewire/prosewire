---
name: prosewire-image-release
description: Release and verify a stable Prosewire Docker image through the versioned image workflow. Use when asked to publish a stable image version, create its GitHub release, change the latest image, or verify GHCR tags, digest, platform, or runtime contents.
---

# Prosewire Image Release

Release only with explicit authorization. Inspect `.github/workflows/release-image.yml` as the source of truth.

1. Check `git status --short --branch`, fetch the remote, validate plain semver, and resolve the source ref to an immutable commit.
2. Confirm `v<version>` is unused or already points to the same commit.
3. Dispatch the stable image workflow and monitor tag creation, build, GHCR push, and GitHub release creation.
4. Verify `v<version>`, `<version>`, `latest`, and `sha-<short-sha>` resolve to the published digest and advertised platform.
5. Pull anonymously with an isolated Docker config when possible, then verify the default web command, worker artifact, and database migrations exist.
6. If deployment was requested, exercise the real public health and content surfaces.

Report the version, source revision, workflow result, digest, tags, platform, anonymous availability, release URL, runtime checks, and any exact gap. A green workflow alone is not completion.
