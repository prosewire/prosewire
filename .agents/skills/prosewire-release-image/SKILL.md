---
name: prosewire-release-image
description: Trigger and validate Prosewire's manual stable multi-platform container image workflow. Use when a maintainer asks to publish or verify the GHCR image. Do not use for npm packages or edge images.
---

# Release the Prosewire image

When the user explicitly asks to publish now, fetch `origin/main`, read its root
version, and resolve its full commit SHA. Dispatch
`.github/workflows/release-image.yml` on `main` with those `version` and `ref`
inputs. Capture the run URL or ID and watch that exact run through completion.

Do not build, tag, or push an image locally. The workflow owns validation, the
multi-platform build, digest checks, stable GHCR tags, the immutable Git tag, and
the GitHub Release. GitHub generates the image changelog from the previous
stable image tag.

After the run, confirm the Git tag and GitHub Release point to the requested
commit. Confirm `vX.Y.Z`, `X.Y.Z`, and `latest` share one digest with
`linux/amd64` and `linux/arm64` manifests. Return the run and release URLs, tag,
commit, and digest-pinned image reference.

If the run fails after publishing may have started, inspect the existing tag,
release, aliases, digest, and failed logs. Do not retry automatically or move a
released version to another commit.
