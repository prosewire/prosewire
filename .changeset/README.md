# Changesets

Run `pnpm changeset` for any public behavior or API change in `@prosewire/sdk`,
`@prosewire/cli`, or `@prosewire/mcp`.

For a version PR, run `pnpm version-packages`. This consumes pending Changesets,
updates linked manifests and changelogs, and synchronizes runtime-reported
versions. Before dispatching publication, run `pnpm release:preflight`; package
publishing deliberately fails while any release Changeset remains.
