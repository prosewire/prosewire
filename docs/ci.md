# Repository automation

Pull requests do not start GitHub Actions workflows and no Actions check is
required to merge. Cloudflare Workers Builds owns previews and production
deployments for `apps/site`; its build watch paths must exclude unrelated
repository files.

The repository has three workflows.

## Manual validation

`Validate` runs only through `workflow_dispatch` or as the reusable test job for
an image release. It accepts a branch, tag, or immutable commit and runs:

- formatting and lint checks;
- workflow linting;
- workspace typechecks and coverage tests;
- PostgreSQL migrations and database tests;
- the Redis email-queue test;
- the web build and Playwright acceptance tests.

Validation never runs automatically for a pull request or an ordinary push.

## Package releases

`Release packages` runs only through `workflow_dispatch` on `main`. One serialized
job consumes all pending Changesets, generates versions and changelogs, runs the
package release preflight, and commits the generated files directly to `main`.
It refuses to push if `main` moved after checkout.

After pushing the version commit, the same job publishes through npm trusted
publishing, creates a Changesets Git tag and GitHub release for every published
package version, and verifies every package, tag, release, and provenance. The
release identity must be allowed to bypass the pull-request rule for this one
direct push. Use the `RELEASE_GITHUB_TOKEN` secret for that identity when the
default Actions token has no bypass permission.

Do not retry after an uncertain npm result without querying the registry first.

## Image releases

`Release image` has two entry points. A relevant push to `main` tests the exact
commit, builds a `linux/amd64` candidate, verifies its metadata and runtime, and
promotes the digest to `edge`. A manual dispatch tests the requested commit,
builds and verifies the `linux/amd64` candidate, then publishes stable tags, the
Git tag, and the GitHub release. The release links to the GHCR package and lists
the pull commands, digest, architecture, and published tags. When an earlier
stable `vX.Y.Z` image tag exists, GitHub generates the changelog from that tag.
The first stable image release does not use an npm package release as its
changelog baseline.

Both paths call `Validate` before building an image. They also smoke-test the
built container before changing a public image tag.

Edge changes are limited to the web app, worker, internal runtime packages,
database migrations, Docker inputs, and shared build or dependency inputs. Site
files, documentation, tests, and the SDK, CLI, MCP, Next.js, Astro, and
`create-prosewire` packages do not build an edge image. A shared lockfile change
accompanied only by those non-runtime packages is also skipped. A lockfile-only
change builds conservatively.
