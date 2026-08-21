# Configure release automation

Read the repository files before changing this setup. Preserve the current
package relationships and the stable image workflow's ownership of Git tags and
GitHub releases.

## Changesets

The repository uses Changesets v3. Keep these pieces connected:

- `.changeset/config.json` sets `main` as the base branch, public access, and
  the linked package groups that must version together.
- `pnpm changeset` records a public change.
- `pnpm version-packages` runs `changeset version` and then synchronizes
  runtime-reported versions.
- `pnpm release` runs the repository preflight before `changeset publish`.

If the Changesets files are missing, add `@changesets/cli` as a root
development dependency and run `pnpm changeset init` once. Do not reinitialize
an existing `.changeset` directory. Review the generated config instead of
accepting defaults that conflict with the current linked groups or `main`.

Do not put `pnpm release:preflight` unconditionally before the Changesets
action. Pending Changesets are valid on `main` and must reach the action so it
can create the version PR. The publish script runs the preflight after the
version PR has consumed them.

Every public behavior or API change needs the smallest accurate Changeset.
Choose a linked group only when those packages must share a version. Do not add
a package to a group merely because it lives in the monorepo.

## GitHub Actions

The package workflow runs on pushes to `main`. Its required shape is:

- Full-history checkout so Changesets can compare commits and tags.
- GitHub token permissions `contents: write` and `pull-requests: write` for the
  version PR.
- `id-token: write` for npm trusted publishing.
- A GitHub-hosted runner, a supported Node version, and an npm CLI with trusted
  publishing support.
- A Changesets action version compatible with the installed Changesets major,
  pinned to a full commit SHA.
- `version-script: pnpm version-packages` and
  `publish-script: pnpm release`.
- `create-github-releases: false` and `push-git-tags: false` while the stable
  image workflow owns the repository tag and release.
- Registry verification conditioned on the Changesets action reporting a
  publication.

Run the repository's complete release checks before the Changesets action. Run
them again after the version PR merge and before publication. Keep concurrency
non-cancelling so a newer push cannot interrupt an active publish.

GitHub must allow Actions to create pull requests. Inspect the setting with:

```bash
gh api repos/prosewire/prosewire/actions/permissions/workflow
```

`can_approve_pull_request_reviews` must be `true`. Changing it is an external
repository mutation and requires explicit authorization. With approval, set it
without broadening the default workflow token:

```bash
gh api --method PUT \
  repos/prosewire/prosewire/actions/permissions/workflow \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=true
```

Protect `main` with the required CI checks. The workflow's explicit
`permissions` block should remain the least authority needed for the release
job.

## npm package configuration

Each public package manifest must have:

- A unique npm name and a deliberate plain-semver version.
- `private` absent or `false`.
- `publishConfig.access` set to `public`.
- `publishConfig.provenance` set to `true` for automated releases.
- Correct `files`, exports, declarations, binaries, license, engine,
  repository, homepage, and bugs metadata.
- A build or `prepublishOnly` script that produces every published file.
- Workspace dependencies that pack to valid registry ranges. Never publish a
  `workspace:` range.

Keep the workflow's `PUBLIC_PACKAGE_DIRECTORIES`,
`scripts/release-preflight.mjs`, and `scripts/package-tarball-smoke.mjs` in
agreement. Run `pnpm test:packages` after any package or packaging change.

## npm trusted publishing

An npm package must exist before npm can attach a trusted publisher. Use the
new-package reference for the first publication. For an existing package,
use a current npm CLI and confirm `npm trust github --help` works. Configure the
current workflow with:

```bash
npm trust github <package-name> \
  --repo prosewire/prosewire \
  --file release.yml \
  --allow-publish \
  --yes
```

The workflow has no GitHub environment, so do not pass `--environment`. If an
environment is added later, update both the workflow and every npm trust
relationship together.

Verify the live relationship:

```bash
npm trust list <package-name> --json
```

Do not add an npm write token to the normal workflow. The workflow uses OIDC
and its `id-token: write` permission. Confirm the npm organization, package
ownership, workflow filename, repository, allowed operation, and optional
environment all match before merging a version PR.

## End-to-end check

Before calling the setup complete:

1. Add a harmless test Changeset only when the user authorizes that repository
   change, or use the next real Changeset.
2. Confirm the push to `main` creates or updates the version PR without
   publishing.
3. Review and merge the version PR only with explicit release authorization.
4. Confirm the second workflow run publishes with OIDC and verifies every
   expected registry version.
5. Install the published packages into a clean temporary consumer and test the
   relevant imports and binaries.
