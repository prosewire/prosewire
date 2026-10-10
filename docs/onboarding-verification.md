# Fresh-install reader verification

The package consumer smoke test validates tarball contents, JavaScript imports,
public declarations, and executable entrypoints. The fresh-reader proof extends
that same packaging path: it installs packages into four clean temporary apps,
runs the packaged `create-prosewire` CLI, then builds and serves the Next.js App
Router, Next.js Pages Router, Astro static, and Astro server readers. Astro's
injected routes are checked alongside the scaffolded pages.

The backend is real. Before building consumers, the suite verifies that the
acceptance publication exposes the published fixture, hides draft, scheduled,
archived, future-dated published, other-publication, and missing fixtures, and
resolves an old slug. The same checks run against each production reader. Static
Astro redirects are HTML refresh documents; server routes and Next.js use HTTP
permanent redirects.

## From source in acceptance tests

Use a dedicated test database. Acceptance setup resets its test schema and
refuses database names or schemas without `test` or `acceptance`. Do not supply
production credentials. Build the web app and run the focused acceptance test:

```shell
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=@prosewire/web
pnpm --filter @prosewire/web test:acceptance framework-readers.spec.ts
```

Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, and the other acceptance runtime
configuration as for `pnpm test:acceptance`. The existing acceptance fixture setup
and web server start once; the proof uses a distinct ephemeral port for each host
app and stops only processes it owns. This test runs in the normal acceptance
suite, including the Validate workflow.

## Against published packages

To verify current npm artifacts, point the suite at an isolated deployment that
has been populated with `apps/web/acceptance/global-setup.ts` fixtures. This
command performs public reads only; it does not seed or mutate the deployment:

```shell
PROSEWIRE_ONBOARDING_URL=http://127.0.0.1:3000 \
  pnpm test:onboarding --registry-latest
```

`--registry-latest` resolves npm's current versions for the package checks and
reports the exact versions installed in each reader fixture. Keep the log with the backend's `/api/health` response and
image digest or source commit. An old package release failing this proof remains
an artifact failure even if a source tarball passes. To verify the exact versions
in the checkout's manifests, use `--registry` instead.

Without a registry flag, `pnpm test:onboarding` builds and packs the checkout.
It never treats a workspace import or a passing tarball check as evidence that
npm has accepted a release. Temporary consumer directories are removed on both
success and failure. Fixtures have no management credentials in their reader
configuration.

This proof checks server HTML, status codes, known static outputs, and semantic
`pw-*` hooks. It does not replace dashboard onboarding acceptance, a coordinated
backup restore, or migration/web/worker checks against the actual stable image.
For the latter, run the existing `scripts/container-runtime-smoke.sh IMAGE`
against the immutable public image reference; it creates and removes its own
Postgres and Redis containers.
