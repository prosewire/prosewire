#!/usr/bin/env bash
set -euo pipefail

actionlint_version="1.7.12"
shellcheck_version="0.11.0"
os="$(uname -s)"
arch="$(uname -m)"

case "$os/$arch" in
  Darwin/arm64)
    actionlint_asset="actionlint_${actionlint_version}_darwin_arm64.tar.gz"
    actionlint_checksum="aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f"
    shellcheck_asset="shellcheck-v${shellcheck_version}.darwin.aarch64.tar.gz"
    shellcheck_checksum="339b930feb1ea764467013cc1f72d09cd6b869ebf1013296ba9055ab2ffbd26f"
    ;;
  Linux/x86_64)
    actionlint_asset="actionlint_${actionlint_version}_linux_amd64.tar.gz"
    actionlint_checksum="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"
    shellcheck_asset="shellcheck-v${shellcheck_version}.linux.x86_64.tar.gz"
    shellcheck_checksum="b7af85e41cc99489dcc21d66c6d5f3685138f06d34651e6d34b42ec6d54fe6f6"
    ;;
  *)
    echo "Unsupported platform for pinned workflow linting: $os/$arch" >&2
    exit 1
    ;;
esac

tool_dir="$(mktemp -d)"
trap 'rm -rf "$tool_dir"' EXIT
actionlint_archive="$tool_dir/$actionlint_asset"
shellcheck_archive="$tool_dir/$shellcheck_asset"
curl -fsSL "https://github.com/rhysd/actionlint/releases/download/v${actionlint_version}/${actionlint_asset}" -o "$actionlint_archive"
curl -fsSL "https://github.com/koalaman/shellcheck/releases/download/v${shellcheck_version}/${shellcheck_asset}" -o "$shellcheck_archive"

if command -v sha256sum >/dev/null 2>&1; then
  echo "$actionlint_checksum  $actionlint_archive" | sha256sum -c - >/dev/null
  echo "$shellcheck_checksum  $shellcheck_archive" | sha256sum -c - >/dev/null
else
  test "$(shasum -a 256 "$actionlint_archive" | awk '{print $1}')" = "$actionlint_checksum"
  test "$(shasum -a 256 "$shellcheck_archive" | awk '{print $1}')" = "$shellcheck_checksum"
fi

tar -xzf "$actionlint_archive" -C "$tool_dir" actionlint
tar -xzf "$shellcheck_archive" -C "$tool_dir" --strip-components=1 \
  "shellcheck-v${shellcheck_version}/shellcheck"
PATH="$tool_dir:$PATH" "$tool_dir/actionlint" -no-color
