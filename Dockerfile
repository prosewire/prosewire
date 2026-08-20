FROM node:26-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/site/package.json apps/site/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contract/package.json packages/contract/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/mcp/package.json packages/mcp/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
RUN pnpm --filter @prosewire/web... build && pnpm --filter @prosewire/worker build

FROM node:26-alpine AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PROSEWIRE_MIGRATIONS_DIR=/app/packages/db/drizzle
WORKDIR /app
RUN addgroup --system --gid 1001 prosewire && adduser --system --uid 1001 --ingroup prosewire prosewire
COPY --from=builder --chown=prosewire:prosewire /app/apps/web/.next/standalone ./
COPY --from=builder --chown=prosewire:prosewire /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=prosewire:prosewire /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=prosewire:prosewire /app/packages/db/drizzle ./packages/db/drizzle
USER prosewire
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
