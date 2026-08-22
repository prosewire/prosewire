#!/usr/bin/env bash
set -euo pipefail

reference="${1:?usage: verify-anonymous-image-pull.sh <image@digest> [platform]}"
platform="${2:-linux/amd64}"
docker_config="$(mktemp -d)"
trap 'rm -rf "$docker_config"' EXIT

DOCKER_CONFIG="$docker_config" docker pull --platform "$platform" "$reference"
DOCKER_CONFIG="$docker_config" docker image inspect "$reference" >/dev/null
echo "Verified anonymous pull of $reference for $platform."
