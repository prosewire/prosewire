# Contributing to Prosewire

Prosewire is currently developed in a private pre-release repository. Collaborators should branch from `main`, keep changes narrowly scoped, and open a pull request for review.

## Development workflow

1. Install Node.js 24+ and pnpm 11+.
2. Copy `.env.example` to `.env`, then run `pnpm install` and `pnpm dev:services`.
3. Make the change with tests at the owning domain or transport boundary.
4. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the relevant build or acceptance suite.
5. Add a Changeset for user-visible changes to the SDK, CLI, or MCP packages.

Do not commit credentials, generated build output, or release artifacts. Releases and deployments require an explicit maintainer request.
