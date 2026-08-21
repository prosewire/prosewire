#!/usr/bin/env bash
set -euo pipefail

version="1.7.12"
os="$(uname -s)"
arch="$(uname -m)"

case "$os/$arch" in
  Darwin/arm64)
    asset="actionlint_${version}_darwin_arm64.tar.gz"
    checksum="aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f"
    ;;
  Linux/x86_64)
    asset="actionlint_${version}_linux_amd64.tar.gz"
    checksum="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"
    ;;
  *)
    echo "Unsupported platform for pinned actionlint: $os/$arch" >&2
    exit 1
    ;;
esac

tool_dir="$(mktemp -d)"
trap 'rm -rf "$tool_dir"' EXIT
archive="$tool_dir/$asset"
curl -fsSL "https://github.com/rhysd/actionlint/releases/download/v${version}/${asset}" -o "$archive"

if command -v sha256sum >/dev/null 2>&1; then
  echo "$checksum  $archive" | sha256sum -c - >/dev/null
else
  test "$(shasum -a 256 "$archive" | awk '{print $1}')" = "$checksum"
fi

tar -xzf "$archive" -C "$tool_dir" actionlint
"$tool_dir/actionlint" -no-color
