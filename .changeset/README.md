# Changesets

Run `pnpm changeset` for any public behavior or API change in `@prosewire/sdk`,
`@prosewire/cli`, `@prosewire/mcp`, `@prosewire/next`, `@prosewire/astro`,
or `create-prosewire`.

On each push to `main`, the package workflow uses the Changesets action to
create or update the version PR. The action runs `pnpm version-packages`, which
consumes pending Changesets, updates linked manifests and changelogs, and
synchronizes runtime-reported versions. Merging the version PR triggers the
same workflow again; it runs `pnpm release` and verifies the published versions
on npm. Package publishing deliberately fails while any release Changeset
remains.
