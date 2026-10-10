# Changesets

Run `pnpm changeset` for any public behavior or API change in `@prosewire/sdk`,
`@prosewire/cli`, `@prosewire/mcp`, `@prosewire/next`, `@prosewire/astro`,
or `create-prosewire`.

When a maintainer manually dispatches `Release packages` on `main`, the workflow
runs `pnpm version-packages`, consumes every pending Changeset, updates package
manifests and changelogs, and synchronizes runtime-reported versions. It runs the
release preflight and pushes a version branch for pull request review. After that
PR is merged, dispatch the same workflow again with no pending Changesets to
publish the packages, create each Changesets package tag and GitHub release, and
verify the published versions on npm plus their tags and releases. The preparation
workflow refuses to push if `main` moved after checkout or its release branch
already exists; it never publishes from the unmerged branch.
