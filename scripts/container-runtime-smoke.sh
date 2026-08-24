#!/usr/bin/env bash
set -euo pipefail

image="${1:?usage: container-runtime-smoke.sh IMAGE_REFERENCE}"
suffix="${GITHUB_RUN_ID:-$$}-${RANDOM}"
network="prosewire-smoke-network-$suffix"
postgres="prosewire-smoke-postgres-$suffix"
redis="prosewire-smoke-redis-$suffix"
worker="prosewire-smoke-worker-$suffix"
web="prosewire-smoke-web-$suffix"
# postgres:17.11-alpine3.24 multi-platform index
postgres_image="postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73"
redis_image="redis:7-alpine@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf"
database_url="postgres://prosewire:prosewire-smoke@$postgres:5432/prosewire_smoke"
redis_url="redis://$redis:6379"
auth_secret="runtime-smoke-secret-unique-to-this-test-only"

cleanup() {
  docker rm -f "$web" "$worker" "$redis" "$postgres" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$network" >/dev/null
docker run --detach --name "$postgres" --network "$network" \
  --env POSTGRES_DB=prosewire_smoke \
  --env POSTGRES_USER=prosewire \
  --env POSTGRES_PASSWORD=prosewire-smoke \
  "$postgres_image" >/dev/null
docker run --detach --name "$redis" --network "$network" \
  "$redis_image" redis-server --appendonly yes --appendfsync everysec \
  --maxmemory-policy noeviction >/dev/null

for attempt in $(seq 1 30); do
  if docker exec "$postgres" pg_isready -U prosewire -d prosewire_smoke >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    docker logs "$postgres" >&2
    echo "Postgres did not become ready" >&2
    exit 1
  fi
  sleep 1
done

for attempt in $(seq 1 30); do
  if docker exec "$redis" redis-cli ping >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then
    docker logs "$redis" >&2
    echo "Redis did not become ready" >&2
    exit 1
  fi
  sleep 1
done

docker run --rm --network "$network" \
  --env DATABASE_URL="$database_url" \
  "$image" node apps/worker/dist/migrate.mjs

common_env=(
  --env NODE_ENV=production
  --env DATABASE_URL="$database_url"
  --env REDIS_URL="$redis_url"
  --env BETTER_AUTH_SECRET="$auth_secret"
  --env PROSEWIRE_PUBLIC_URL=http://web:3000
  --env NEXT_PUBLIC_PROSEWIRE_PUBLIC_URL=http://web:3000
  --env NEXT_DEPLOYMENT_ID=runtime-smoke
  --env PROSEWIRE_ALLOW_SIGN_UP=false
)

docker run --detach --name "$worker" --network "$network" \
  "${common_env[@]}" \
  "$image" node apps/worker/dist/index.mjs >/dev/null
docker run --detach --name "$web" --network "$network" \
  "${common_env[@]}" \
  "$image" >/dev/null

for attempt in $(seq 1 60); do
  if docker exec "$web" wget --spider -q http://127.0.0.1:3000/api/health; then
    break
  fi
  if ! docker inspect "$web" --format '{{.State.Running}}' | grep -q true; then
    docker logs "$web" >&2
    echo "Web process exited before health passed" >&2
    exit 1
  fi
  if [ "$attempt" -eq 60 ]; then
    docker logs "$web" >&2
    echo "Web health endpoint did not become ready" >&2
    exit 1
  fi
  sleep 1
done

test "$(docker inspect "$worker" --format '{{.State.Running}}')" = "true"
docker run --rm --entrypoint /bin/sh "$image" -ec '
  test -f /app/apps/web/server.js
  test -f /app/apps/worker/dist/index.mjs
  test -f /app/apps/worker/dist/migrate.mjs
  test -f /app/packages/db/drizzle/meta/_journal.json
'

echo "Container migrations, web, worker, runtime files, and /api/health passed."
