# shellcheck shell=bash
# Sourced by the step scripts beside it; never run on its own.
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

note() { echo "${GITHUB_ACTIONS:+::notice::}$*"; }
die() { echo "${GITHUB_ACTIONS:+::error::}$*" >&2; exit 1; }
need() { for v; do [ -n "${!v:-}" ] || die "$v is unset: the runner environment must carry it"; done; }

# <cmd...> timed: its wall time becomes a line of the run's summary page, and its exit status is
# its own. The summary shows where a job's minutes go.
timed() {  # <label> <cmd...>
  local t=$SECONDS rc=0
  "${@:2}" || rc=$?
  echo "- $1: $((SECONDS - t)) s$([ "$rc" = 0 ] || echo " (exit $rc)")" >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
  return "$rc"
}

# <cmd> from <dir>, inside the repo's flake shell when its root holds a flake.nix: the shell
# its own CI used, carrying the JDK, the SDKs and system libraries such as webkitgtk. Under
# CHANGE_FLAKE_ROOTS (a group leg's scratch dir) the shell is realised once as a profile there,
# a GC root: auto-GC on a full store otherwise deletes it between members, and each next one
# fetched it again (rootstock run 44321045841: 5 h).
in_flake() {  # <dir> <cmd...>
  local top shell
  top=$(git -C "$1" rev-parse --show-toplevel) || return
  if [ -f "$top/flake.nix" ]; then
    shell=$top
    if [ -n "${CHANGE_FLAKE_ROOTS:-}" ]; then
      shell=$CHANGE_FLAKE_ROOTS/$(cksum <<<"$top" | cut -d' ' -f1)
      [ -e "$shell" ] || nix develop --accept-flake-config --profile "$shell" "$top" --command true || return
    fi
    set -- "$1" nix develop --accept-flake-config "$shell" --command "${@:2}"
  fi
  (cd "$1" && "${@:2}")
}

# uv's own map of the workspace holding member dir $1: sets root, dir and name.
ws() {
  local meta
  dir=$(cd "$1" && pwd -P)
  meta=$(cd "$dir" && uv workspace metadata --preview-features workspace-metadata)
  root=$(jq -r .workspace_root <<<"$meta")
  name=$(jq -r --arg p "$dir" '.members[] | select(.path == $p) | .name' <<<"$meta")
  [ -n "$name" ] || die "$1 is not a member of the uv workspace at $root"
}

# mypy as the repo configures it: a mypy.ini at the workspace root, else the member's
# own [tool.mypy] over the `files` it names, else its src/, else the member.
typecheck() {  # <root> <dir> <name>
  local cwd args cache rel=${2#"$1"}
  rel=${rel#/}
  if [ -f "$1/mypy.ini" ]; then
    cwd=$1 args=(--config-file mypy.ini "${rel:-.}")
  elif grep -q '^\[tool\.mypy\]' "$2/pyproject.toml"; then
    cwd=$2 args=()
    python3 -c 'import sys, tomllib; sys.exit(0 if tomllib.load(open(sys.argv[1], "rb"))["tool"]["mypy"].get("files") else 1)' \
      "$2/pyproject.toml" || { [ -d "$2/src" ] && args=(src); } || args=(.)
  else
    note "$3: no mypy config, so no type-check" && return 0
  fi
  # A cache per member (every member has a tests.conftest, and a shared cache serves one the
  # other's), kept in the runner unit's persistent HOME so a library leg's sweep runs warm.
  cache="${HOME:-${TMPDIR:-/tmp}}/.cache/change-mypy/${GITHUB_REPOSITORY:-local}/$(cksum <<<"${2#"$1"}" | cut -d' ' -f1)"
  echo "== mypy $3 =="
  (cd "$cwd" && MYPY_CACHE_DIR=$cache uv run --no-sync mypy "${args[@]}")
}

# pytest on <path> from <cwd> in the workspace env at <root>, CHANGE_WORKERS workers (the
# member's [tool.change] workers, default two) when xdist is there: each worker holds the app
# (about 0.75 GB), and at four workers four legs filled the host's 16G runner pool and were
# OOM-killed (01/11), so a member raises it only for a measured footprint. The paths go absolute: a conftest that changes
# directory at import would otherwise start xdist's workers where a relative path names nothing.
tests() {  # <root> <cwd> <path>... [NAME=value...]
  local args=(-p no:cacheprovider) paths=() env=() a
  for a in "${@:3}"; do
    if [[ $a =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then env+=("$a"); else paths+=("$a"); fi
  done
  (cd "$1" && uv run --no-sync python -c 'import xdist' 2>/dev/null) && args+=(-n "${CHANGE_WORKERS:-2}")
  # pytest's slowest 30 tests go to the run's summary page; its own output and status stand.
  local out rc=0 t=$SECONDS label=$3
  [ "${#paths[@]}" -eq 1 ] || label="${#paths[@]} test files"
  out=$(mktemp)
  (cd "$2" && mapfile -t abs < <(realpath "${paths[@]}") &&
    env "${env[@]}" uv run --no-sync --project "$1" python -m pytest "${abs[@]}" "${args[@]}" --durations=30 --durations-min=0) | tee "$out" || rc=$?
  {
    echo "- pytest $label: $((SECONDS - t)) s$([ "$rc" = 0 ] || echo " (exit $rc)")"
    echo "<details><summary>pytest $label: slowest tests</summary>"
    echo
    echo '```'
    sed -n '/ slowest .* durations /,/^=\+ .* =\+$/p' "$out" | sed '$d'
    echo '```'
    echo "</details>"
  } >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
  rm -f "$out"
  return "$rc"
}

# Every tracked tests/ in the repo at <top> outside the members at the given paths (the root
# member's aside), the planner's ignored dirs and any other project: sets found.
repo_tests() {  # <top> [member-path...]
  local t p files dirs
  found=()
  files=$(git -C "$1" ls-files) || return
  mapfile -t dirs < <(awk -F/ '{for (i = 1; i < NF; i++) if ($i == "tests") {
    s = $1; for (j = 2; j <= i; j++) s = s "/" $j; print s; break }}' <<<"$files" | sort -u)
  for t in "${dirs[@]}"; do
    case $t in docs/* | .claude/* | .github/* | .vscode/*) continue ;; esac
    for p in "${@:2}"; do
      if [ -n "$p" ] && [[ $t == "$p/"* ]]; then continue 2; fi
    done
    p=$(dirname "$t")
    while [ "$p" != . ]; do
      if [ -f "$1/$p/pyproject.toml" ] || [ -f "$1/$p/package.json" ] || [ -f "$1/$p/copier.yaml" ]; then
        note "$t is inside $p, a project that is not a member: not run" && continue 2
      fi
      p=$(dirname "$p")
    done
    found+=("$t")
  done
}

# Its own tests/, run from the workspace root as the repos' own runners do, under any
# build.smoke_env its server_config.json declares; on a leg the plan scoped, only the test
# files of CHANGE_TESTS (paths in the member), in one run. The repo's root member owns every
# path the other members do not, so it runs every tests/ repo_tests finds.
suite() {  # <root> <dir> <name>
  local smoke=() found=() members=() t known top rc=0 rel=${2#"$1"} scoped=
  rel=${rel#/}
  # Explicit: uv.sh tests this with ||, which turns off set -e in here.
  top=$(cd "$(git -C "$2" rev-parse --show-toplevel)" && pwd -P) || return
  if [ "$2" = "$top" ]; then
    known=$(python3 "$here/plan.py" --repo "$top" --head HEAD --base HEAD) || return
    mapfile -t members < <(jq -r '.members[].path' <<<"$known")
    repo_tests "$top" "${members[@]}" || return
  elif [ -n "${CHANGE_TESTS:-}" ]; then
    read -ra found <<<"$CHANGE_TESTS"
    scoped=1
    note "$3: ${#found[@]} test files reach the change; main's run tests it whole"
    found=("${found[@]/#/${rel:+$rel/}}")
  elif [ -d "$2/tests" ]; then
    found=("${rel:+$rel/}tests")
  fi
  [ "${#found[@]}" -gt 0 ] || { note "$3: no tests/, nothing to run"; return 0; }
  [ -f "$2/server_config.json" ] &&
    mapfile -t smoke < <(jq -r '.build.smoke_env // {} | to_entries[] | "\(.key)=\(.value)"' "$2/server_config.json")
  if [ -n "$scoped" ]; then tests "$1" "$1" "${found[@]}" "${smoke[@]}" || rc=1
  else for t in "${found[@]}"; do tests "$1" "$1" "$t" "${smoke[@]}" || rc=1; done
  fi
  return "$rc"
}

# The workspace at $1 installed whole, then the members at the given dirs (every member,
# given none) type-checked four at a time.
typecheck_all() {  # <root> [member-dir...]
  # Explicit: callers test this with ||, which turns off set -e in here.
  (cd "$1" && uv sync --frozen --all-packages --all-extras) || return
  if [ $# -gt 1 ]; then printf '%s\n' "${@:2}"; else
    (cd "$1" && uv workspace metadata --preview-features workspace-metadata) | jq -r '.members[].path'
  fi | xargs -r -P 4 -n 1 "$here/typecheck.sh"
}
