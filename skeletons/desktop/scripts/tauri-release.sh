#!/usr/bin/env bash
# tauri-action's `tauriScript`: build inside the flake devShell, and on macOS
# verify the signed bundles before the action uploads anything, so a failed
# verification leaves nothing on the draft release.
set -euo pipefail
nix develop --command pnpm tauri "$@"
[[ "${1:-}" == build && "$(uname -s)" == Darwin ]] || exit 0
target=
prev=
for arg in "$@"; do
    [[ "$prev" == --target ]] && target=$arg
    prev=$arg
done
nix develop --command bash scripts/cargo-codesign.sh verify-bundles \
    "src-tauri/target${target:+/$target}/release/bundle/macos"
