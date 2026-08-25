# Changesets

Run `pnpm changeset` for any public behavior or API change in `@prosewire/sdk`,
`@prosewire/cli`, `@prosewire/mcp`, `@prosewire/next`, `@prosewire/astro`,
or `create-prosewire`.

When a maintainer manually dispatches `Release packages` on `main`, the workflow
runs `pnpm version-packages`, consumes every pending Changeset, updates package
manifests and changelogs, and synchronizes runtime-reported versions. It runs the
release preflight, commits the generated files directly to `main`, publishes the
packages, and verifies the published versions on npm. The workflow refuses to
push if `main` moved after checkout.
