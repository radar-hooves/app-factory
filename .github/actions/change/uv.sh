#!/usr/bin/env bash
# A uv member's leg: install only its closure (plus the workspace's default groups,
# which carry the test tooling), type-check it, run its own tests/.
# Usage: uv.sh <member-dir>
. "$(dirname "$0")/lib.sh"
ws "${1:-.}"
[ -f "$root/uv.lock" ] || { note "$name has no lock and no workspace: its image's smoke tests it"; exit 0; }
timed "$name uv sync" bash -c 'cd "$1" && uv sync --frozen --package "$2" --all-extras' _ "$root" "$name"
rc=0
timed "$name mypy" typecheck "$root" "$dir" "$name" || rc=1
timed "$name tests (all)" suite "$root" "$dir" "$name" || rc=1
exit "$rc"
