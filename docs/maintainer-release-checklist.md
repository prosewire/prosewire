# Maintainer release checklist

Use this checklist for manual package and stable image releases. Items labeled
**External** require GitHub, npm, GHCR, or Cloudflare access and are not changed
by repository code.

## Package release

- [ ] Confirm every intended public package change has an accurate Changeset.
- [ ] Confirm `main` contains all changes intended for this release.
- [ ] Dispatch `Validate` for `main` when a full repository check is wanted
      before publishing.
- [ ] Dispatch `Release packages` from `main` and wait for its serialized job.
- [ ] Confirm the workflow generated the expected package versions and
      changelogs, ran the tarball preflight, and pushed one release commit.
- [ ] Confirm every expected package reached npm with provenance and passed the
      registry consumer smoke test.
- [ ] **External, GitHub:** the release identity may bypass the pull-request rule
      only for the generated version commit.
- [ ] **External, npm:** trusted publishing is scoped to this repository and the
      package release workflow.

## Stable image release

- [ ] Confirm the requested version matches `package.json` and the web health
      version at an immutable commit contained in `main`.
- [ ] Dispatch `Release image` with that version and full commit SHA.
- [ ] Confirm the shared validation job passed before the image build started.
- [ ] Confirm both `linux/amd64` and `linux/arm64` manifests, OCI labels,
      migrations, web, worker, required files, and `/api/health` passed.
- [ ] Confirm the workflow verified the candidate digest before creating the
      immutable Git tag and promoting stable image aliases.
- [ ] **External, GHCR:** verify public pull access while signed out of a
      maintainer account.

## Site deployment

- [ ] **External, Cloudflare:** confirm Workers Build watch paths include the
      site and its build inputs and exclude unrelated repository changes.
- [ ] Verify canonical URLs, sitemap, `robots.txt`, documentation links, and the
      custom domain after a production deployment.

## Abort and recovery rules

- Do not reuse a package version after any registry has accepted it. Repair a
  partial release with a new patch version and document the affected artifacts.
- Do not retry publication blindly after an uncertain registry response. Query
  npm first and publish only missing versions.
- Do not create a stable image tag or GitHub release for a digest that has not
  passed manifest, architecture, file-layout, migration, and runtime checks.
- If the package workflow generated a version commit but publication failed,
  keep that commit. Do not rewrite `main`; inspect npm and follow the partial
  release recovery rule.
