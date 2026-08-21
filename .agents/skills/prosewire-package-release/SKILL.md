---
name: prosewire-package-release
description: Configure and operate Prosewire's Changesets and npm trusted-publishing automation, including CI setup, new public packages, first publication, releases, recovery, and live verification.
---

# Prosewire package releases

Use `.github/workflows/release.yml`, `.changeset/config.json`, and the root
package scripts as the current source of truth. Fetch `origin` before assessing
them.

Never publish a package, change GitHub or npm settings, or merge a Changesets
version PR without explicit authorization. Merging the version PR triggers
publication because the package workflow runs on pushes to `main`.

## Choose the relevant instructions

- For Changesets, GitHub Actions, npm OIDC, or trusted-publisher setup, read
  [references/configure-release-automation.md](references/configure-release-automation.md).
- When adding a public package or creating its first npm version, read
  [references/add-public-package.md](references/add-public-package.md). Also
  read the configuration reference because the package inventories and CI
  checks must stay aligned.
- For an ordinary release, use the flow below. Do not load the setup references
  unless configuration or a new package is involved.

## Operate an automated release

1. Confirm the worktree and remote state, then run
   `pnpm changeset status --verbose`. Record the affected packages, bump types,
   linked groups, and expected versions.
2. Check the live npm versions and trusted-publisher configuration before the
   version PR is merged. A package missing from npm requires the first-publish
   procedure in the new-package reference.
3. A push to `main` with pending Changesets should create or update the
   `Version Packages` PR. Review its manifests, changelogs, consumed Changesets,
   internal ranges, and synchronized runtime versions. Run
   `pnpm release:preflight` on the versioned branch.
4. Obtain explicit publication authorization immediately before merging the
   version PR. Do not dispatch or reproduce steps already owned by the current
   workflow.
5. Monitor the `Release packages` run through its tests, Changesets action,
   trusted npm publication, and registry verification. Package Git tags and
   GitHub releases are disabled because the stable image workflow owns the
   repository release.
6. Verify every expected version from npm. Test installed exports,
   declarations, binaries, and runtime imports in a temporary consumer. Confirm
   provenance for automated releases. Local artifacts are not proof of
   publication.
7. Before retrying a failed run, query every expected package version. Stop if
   any version was accepted and follow the repository's partial-release policy.
   Never try to overwrite an npm version.

Report the version PR, merge commit, workflow run, expected and published
versions, trusted-publisher state, provenance, installed-package checks, and any
exact gap.
