# Add a public package

Adding source under `packages/*` makes it a workspace package, but it does not
make the release system complete. Update every inventory and test that controls
publication.

## Repository changes

1. Create the package manifest and public files. Match the metadata requirements
   in the configuration reference. Add a README, changelog, license, build,
   declarations, exports, and binaries where applicable.
2. Decide whether the package versions independently or belongs in an existing
   linked group in `.changeset/config.json`. Preserve actual compatibility
   requirements rather than grouping by convenience.
3. Add its directory to `PUBLIC_PACKAGE_DIRECTORIES` in
   `.github/workflows/release.yml`. This makes registry verification include it.
4. Add its name, directory, binaries, metadata rules, version relationships,
   and runtime-version checks to `scripts/release-preflight.mjs` where they
   apply.
5. Add it to `scripts/package-tarball-smoke.mjs`. Inspect the packed manifest,
   required files, resolved dependency ranges, imports, declarations, and
   executable behavior that users will rely on.
6. If source files report the package version at runtime, update
   `scripts/sync-package-versions.mjs` and test that `pnpm version-packages`
   changes them.
7. Update `.changeset/README.md`, maintainer documentation, install examples,
   and any public package lists.
8. Add the smallest accurate Changeset and run
   `pnpm changeset status --verbose`, targeted tests, `pnpm test:packages`,
   typecheck, lint, and the relevant build.

Do not run `pnpm release:preflight` before versioning while release Changesets
remain. Run it on the generated version PR after Changesets has consumed them.

## First manual publication

npm cannot configure trusted publishing until the package exists. Bootstrap the
current manifest version after the package has reached clean `main`, but before
merging the generated version PR. This is a permanent public write and requires
explicit authorization immediately before `pnpm publish`.

Set and verify the package identity:

```bash
package_name='<npm-package-name>'
package_directory='<directory-under-packages>'
package_manifest="packages/$package_directory/package.json"
bootstrap_version="$(node -p "require('./$package_manifest').version")"

test "$(node -p "require('./$package_manifest').name")" = "$package_name"
test -n "$bootstrap_version"
```

Confirm the checkout and npm account:

```bash
git switch main
git pull --ff-only origin main
git status --short --branch
npm whoami
npm ping
```

The worktree must be clean and the local branch must match `origin/main`.
Check whether the exact version exists:

```bash
npm view "$package_name@$bootstrap_version" version
```

Continue only when npm returns an `E404` for that exact package and version.
Stop on permission, network, ownership, or name-conflict errors.

Build and inspect the package through the repository checks:

```bash
pnpm install --frozen-lockfile
pnpm --filter "$package_name" test
pnpm --filter "$package_name" build
pnpm test:packages
```

Publish one new package at a time. Local first publication cannot use npm OIDC,
so override the manifest's provenance setting for this bootstrap version:

```bash
NPM_CONFIG_PROVENANCE=false pnpm \
  --filter "$package_name" \
  publish \
  --access public \
  --publish-branch main
```

Do not use `pnpm release` for bootstrap. Its preflight correctly rejects
pending Changesets, and `changeset publish` targets every unpublished package.

Verify the permanent registry result before configuring trust:

```bash
npm view "$package_name@$bootstrap_version" \
  name version dependencies dist.tarball
```

The manual bootstrap version will not have provenance. Record that deliberate
exception. Automated versions should have provenance after trusted publishing
is configured.

## Add the package to CI publishing

Configure the trusted publisher:

```bash
npm trust github "$package_name" \
  --repo prosewire/prosewire \
  --file release.yml \
  --allow-publish \
  --yes
```

npm may require two-factor authentication. Verify the stored relationship:

```bash
npm trust list "$package_name" --json
```

Confirm that the workflow package list and release checks contain the new
package. Only then review and merge the generated version PR. Monitor the next
`Release packages` run and verify the automated version, provenance, resolved
dependency ranges, imports, declarations, and binaries from npm.

If any bootstrap or automated publish fails after npm accepts a version, stop.
Inspect the registry state for every package in the release before choosing a
recovery plan. Never retry by attempting to overwrite the accepted version.
