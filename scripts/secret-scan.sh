#!/usr/bin/env bash
set -euo pipefail

version="8.30.1"
os="$(uname -s)"
arch="$(uname -m)"

case "$os/$arch" in
  Darwin/arm64)
    asset="gitleaks_${version}_darwin_arm64.tar.gz"
    checksum="b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5"
    ;;
  Linux/x86_64)
    asset="gitleaks_${version}_linux_x64.tar.gz"
    checksum="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
    ;;
  *)
    echo "Unsupported platform for pinned gitleaks: $os/$arch" >&2
    exit 1
    ;;
esac

tool_dir="$(mktemp -d)"
trap 'rm -rf "$tool_dir"' EXIT
archive="$tool_dir/$asset"
curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v${version}/${asset}" -o "$archive"

if command -v sha256sum >/dev/null 2>&1; then
  echo "$checksum  $archive" | sha256sum -c - >/dev/null
else
  test "$(shasum -a 256 "$archive" | awk '{print $1}')" = "$checksum"
fi

tar -xzf "$archive" -C "$tool_dir" gitleaks
"$tool_dir/gitleaks" git --redact=100 --no-banner --log-opts="--all"
