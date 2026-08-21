# Maintainer release checklist

Use this checklist after a version PR is merged. Items labeled **External**
require GitHub, npm, GHCR, or Cloudflare access and are not changed by repository
code.

## Before merge

- [ ] Run `pnpm version-packages`; confirm SDK, CLI, and MCP versions,
      changelogs, internal packed dependency ranges, and consumed Changesets.
- [ ] Run `pnpm release:preflight` and every required CI, package, docs,
      acceptance, secret-scan, workflow, and image smoke check.
- [ ] Confirm the intended release commit is contained in `origin/main`.
- [ ] Confirm `https://prosewire.com` and its documentation routes resolve over
      HTTPS before publishing repository or package links to them.
- [ ] **External — GitHub:** required CI checks and branch protection are
      enabled for `main`.
- [ ] **External — npm:** trusted publishing is configured for
      `@prosewire/sdk`, `@prosewire/cli`, and `@prosewire/mcp`, scoped to the
      package release workflow and repository.
- [ ] **External — GHCR:** the Prosewire container package is public (or the
      intended audience has pull access).
- [ ] **External — Cloudflare:** `SITE_URL`, deployment credentials, custom
      domains, and production DNS are configured and verified before deploying.

## Publish and verify

- [ ] Dispatch the package workflow with the plain version and immutable commit
      from `main`; confirm npm provenance, metadata, imports, declarations, and
      binaries for every package.
- [ ] Dispatch the stable image workflow with the same immutable commit; record
      the digest and verify both `linux/amd64` and `linux/arm64`, OCI labels,
      migrations, web, worker, required files, and `/api/health`.
- [ ] Confirm the candidate digest is verified before the workflow creates the
      immutable `v<version>` Git tag; confirm stable image aliases all resolve
      to that digest before it creates the GitHub release.
- [ ] **External — npm/GHCR:** verify public install and pull access while signed
      out of maintainer accounts.
- [ ] **External — Cloudflare:** deploy only by an explicit, separate request;
      then verify canonical URLs, sitemap, `robots.txt`, docs links, and health.
- [ ] Verify release notes, checksums/digests, changelogs, README commands, and a
      clean install from the public registries.

## Abort and recovery rules

- Do not reuse a package version after any registry has accepted it. Repair a
  partial release with a new patch version and document the affected artifacts.
- Do not create a stable image tag or GitHub release for a digest that has not
  passed manifest, architecture, file-layout, migration, and runtime checks.
- If a production migration cannot be rolled back safely, restore the tested
  database backup together with the previous application digest.
- Keep deployment separate from package and image publication. A successful
  artifact release does not authorize a production rollout.
