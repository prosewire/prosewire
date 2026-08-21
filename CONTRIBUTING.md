# Contributing to Prosewire

Contributions through public forks are welcome. Keep each pull request focused,
describe the user-facing outcome, and avoid mixing unrelated refactors with a
behavior change.

## Development workflow

1. Fork `prosewire/prosewire`, clone your fork, and add the upstream repository:

   ```shell
   git remote add upstream https://github.com/prosewire/prosewire.git
   git fetch upstream
   git switch --create your-change upstream/main
   ```

2. Install Node.js 24+, pnpm 11+, and Docker. Copy `.env.example` to `.env`,
   then run `pnpm install --frozen-lockfile` and `pnpm dev:services`.
3. Make the smallest complete change and add tests at the owning domain or
   transport boundary. Follow every applicable `AGENTS.md` file.
4. Run `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, and the relevant
   build, package, documentation, or acceptance suite.
5. Run `pnpm changeset` for a user-visible SDK, CLI, or MCP change. Do not edit
   release versions or changelogs directly in a feature pull request.
6. Push the branch to your fork and open a pull request against `main`.

Pull requests should explain the problem, the approach, verification evidence,
and any deliberate limitation. Maintainers may ask for a branch to be rebased
or updated when `main` changes.

## Security and releases

Do not commit credentials, `.env` files, generated build output, package
tarballs, or container exports. Report vulnerabilities through
[SECURITY.md](SECURITY.md), not a public issue.

Package publication, image promotion, deployment, tags, and GitHub releases are
maintainer-only operations and are never implied by merging a contribution.
