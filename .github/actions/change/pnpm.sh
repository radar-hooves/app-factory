#!/usr/bin/env bash
# A pnpm member's leg: install its closure from the lock, then run its own `check` and
# `test` scripts where it has them (lint is pre-commit's). pnpm comes from corepack, at
# the version packageManager names; corepack keeps its downloads under the persistent HOME.
# Usage: pnpm.sh <member-dir> [script...]   (default: check test)
. "$(dirname "$0")/lib.sh"
dir=$(cd "${1:-.}" && pwd)
export CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0 COREPACK_HOME=${COREPACK_HOME:-$HOME/.cache/node/corepack}
# A shim on PATH, not `corepack pnpm`: scripts such as the kits' `test` call pnpm themselves.
mkdir -p "$COREPACK_HOME/bin" && corepack enable --install-directory "$COREPACK_HOME/bin" pnpm
export PATH=$COREPACK_HOME/bin:$PATH
root=$dir
until [ -f "$root/pnpm-lock.yaml" ]; do
  [ "$root" != / ] || die "$1: no pnpm-lock.yaml at or above it"
  root=$(dirname "$root")
done
jq -e .packageManager "$root/package.json" >/dev/null ||
  die "$root/package.json names no packageManager, so corepack would fetch whichever pnpm is newest"
filter=()
[ "$root" = "$dir" ] || filter=(--filter "$(jq -r .name "$dir/package.json")...")
timed "pnpm install" bash -c 'cd "$1" && shift && pnpm install --frozen-lockfile "$@"' _ "$root" "${filter[@]}"
rc=0
scripts=("${@:2}")
[ "${#scripts[@]}" -gt 0 ] || scripts=(check test)
for s in "${scripts[@]}"; do timed "pnpm $s" bash -c 'cd "$1" && pnpm run --if-present "$2"' _ "$dir" "$s" || rc=1; done
# A factory app's frontend refuses a redrawn src/ that its layout-gate record does not
# judge as it lands, measured from the plan's CHANGE_BASE (the check's header has the rule).
# Only an app on a factory release that stamps the check has one, so an app takes it with
# its update, never at once.
[ ! -f "$dir/scripts/check-layout-gate.mjs" ] || timed "layout gate" bash -c 'cd "$1" && node scripts/check-layout-gate.mjs' _ "$dir" || rc=1
exit "$rc"
