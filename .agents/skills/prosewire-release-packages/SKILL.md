---
name: prosewire-release-packages
description: Trigger and validate Prosewire's manual public npm package release workflow. Use when a maintainer asks to publish or verify a package release. Do not use for the container image.
---

# Release Prosewire packages

When the user explicitly asks to publish now, dispatch
`.github/workflows/release.yml` on `main` with `gh workflow run`. Capture the run
URL or ID and watch that exact run through completion.

Do not run Changesets or npm publishing commands locally. The workflow owns the
whole release: it consumes pending Changesets, generates versions and
changelogs, pushes the release commit to `main`, publishes to npm with
provenance, creates package tags and GitHub Releases, and verifies them.

After the run, confirm its reported package versions exist on npm and that the
generated release commit, changelogs, tags, and GitHub Releases exist. Return
the run URL, release commit, package versions, and release URLs.

If the run fails after publishing may have started, inspect npm, tags, releases,
and the failed logs. Do not retry automatically or rewrite the release commit.
