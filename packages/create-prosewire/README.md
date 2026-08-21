# `create-prosewire`

Add a Prosewire reader to an existing Next.js or Astro project.

```sh
pnpm create prosewire@latest \
  --url https://publish.example.com \
  --blog fieldnotes \
  --route /blog
```

The command detects the framework, installs `@prosewire/next` or `@prosewire/astro`, and writes thin route files. It refuses to overwrite existing routes.

Pass `--agent` to print a setup prompt instead of changing the project. Pass `--router app` or `--router pages` when a Next.js project contains both routers.

## Monorepos

Run the command from the workspace root. If the workspace contains one supported app, the scaffolder selects it automatically. If it contains more than one, target the app explicitly:

```sh
pnpm create prosewire@latest \
  --cwd apps/web \
  --url https://publish.example.com \
  --blog fieldnotes \
  --route /blog
```

`--cwd` is relative to the directory where the command runs. The dependency is added to the target app, while installation runs from the workspace root using its `packageManager` field or npm, pnpm, Yarn, or Bun lockfile. This avoids creating a lockfile inside the app.
