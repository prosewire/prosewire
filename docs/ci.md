# Continuous integration

The CI workflow classifies changes before it starts package, database, browser,
or image work. Pull requests compare the pull request base and head SHAs. Pushes
compare the event's `before` SHA with its head SHA, covering every commit in the
push and deleted paths. A missing range and an ordinary manual dispatch take the
conservative full-validation path.

The release workflow can dispatch CI for a Changesets version pull request when
GitHub's own token suppresses `pull_request` workflows. That dispatch supplies a
pull request number; CI verifies the open pull request, repository, base branch,
and exact head SHA through GitHub before using its base and head. Other manual
runs remain conservative.

## Classification rules

| Change | Quality and package checks | Dependency audit | Runtime integration | Edge image |
| --- | --- | --- | --- | --- |
| Public package source or test | Affected Turbo tasks and the affected tarball contract; SDK changes also test its public consumers | No | SDK changes only, because acceptance tests consume it | No |
| Web, worker, database, migration, core, contract, or runtime config | Affected Turbo tasks; shared contract/config changes smoke-test all public packages | For manifests only | Yes | Yes |
| Any lockfile, package manifest, workspace file, pnpm config, or patch | Full package validation for shared root inputs | Yes | Yes when it can affect the runtime build; version-only public package manifests are excluded | Same rule as runtime integration |
| Dockerfile, Compose, or container validation input | Relevant quality | No | Yes | Yes for Dockerfile and build-context inputs |
| Changeset, public package changelog, or publishable package source | Relevant quality and package smoke tests | For manifests only | Only if runtime-affecting | Only if image-affecting |
| Workflow or classifier | Full validation | Yes | Yes | Yes |
| Documentation or unrelated repository metadata | Changed-file formatting and any affected Turbo tasks | No | No | No |

Package tarball selection follows public contracts. CLI, MCP, Next.js, and Astro
always include the SDK they consume. An SDK change includes all four consumers.
Changes to shared package infrastructure, configuration, contract types, or the
tarball smoke test cover every public package.

`CI integration` and `Lockfile dependency audit` are lightweight required
reporting jobs. They remain present for branch protection even when their heavy
work is legitimately skipped. Runtime integration still depends on `CI quality`,
so a basic failure prevents PostgreSQL, Redis, Playwright, and Docker from
starting. Secret history scanning is never path-filtered.

Package publishing is dispatched only for publishable package or Changesets
changes after all protected CI jobs pass on `main`. The release workflow checks
out the immutable tested SHA and validates its originating CI run before it can
request npm trusted-publishing credentials. Edge images are built only for image
inputs. Stable image releases remain manual, gated, and serialized.
