#!/usr/bin/env bash
set -euo pipefail

image="${1:?usage: verify-image-runtime-files.sh IMAGE_REFERENCE PLATFORM...}"
shift
test "$#" -gt 0
manifest="$(docker buildx imagetools inspect "$image" --raw)"
repository="${image%@*}"

for platform in "$@"; do
  IFS=/ read -r os architecture <<< "$platform"
  platform_digest="$(
    jq -er --arg os "$os" --arg architecture "$architecture" '
      [
        .manifests[]
        | select(.platform.os == $os and .platform.architecture == $architecture)
      ][0].digest
    ' <<< "$manifest"
  )"
  platform_image="$repository@$platform_digest"
  docker pull "$platform_image" >/dev/null
  container="$(docker create --platform "$platform" --entrypoint /bin/true "$platform_image")"
  listing="$(mktemp)"
  cleanup() {
    docker rm "$container" >/dev/null 2>&1 || true
    rm -f "$listing"
  }
  trap cleanup EXIT
  docker export "$container" | tar -tf - > "$listing"
  for required in \
    app/apps/web/server.js \
    app/apps/worker/dist/index.mjs \
    app/apps/worker/dist/migrate.mjs \
    app/packages/db/drizzle/meta/_journal.json; do
    if ! grep -Fxq "$required" "$listing"; then
      echo "$platform image is missing /$required" >&2
      exit 1
    fi
  done
  cleanup
  trap - EXIT
  echo "Verified required runtime files for $platform."
done
