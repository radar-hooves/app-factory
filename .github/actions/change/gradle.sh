#!/usr/bin/env bash
# Gradle members' leg: each project's `check` (Android's includes Lint), by the build's own
# wrapper. Several members of one build run as ONE invocation (`--continue`, two workers): the
# JVM start and the configuring of every project is most of a member's five minutes. Each
# member the build's own output confirms green is appended to $GRADLE_PASSED (a file, one dir per
# line); every other member of a red build failed or was skipped, and the caller names it. A repo's exclusions and setup belong in its own
# build, never here.
# Usage: gradle.sh <member-dir>...
. "$(dirname "$0")/lib.sh"
up() {  # the nearest dir at or above $1 holding a Gradle settings file, if any
  local d=$1
  until [ -f "$d/settings.gradle.kts" ] || [ -f "$d/settings.gradle" ]; do
    [ "$d" != / ] || return 0
    d=$(dirname "$d")
  done
  echo "$d"
}
run() {  # <root> <member-dir><TAB><task>... ; the tasks of one build, or `-p <path> check` alone
  local root=$1 tasks=() dirs=() m log i rc=0
  shift
  for m; do dirs+=("${m%%$'\t'*}") tasks+=("${m#*$'\t'}"); done
  log=$(mktemp)
  if [ "${#tasks[@]}" -eq 1 ]; then
    # shellcheck disable=SC2086 # an included build's task is `-p <path> check`, split on purpose
    in_flake "$root" ./gradlew --no-daemon --stacktrace ${tasks[0]} || rc=1
  else
    in_flake "$root" ./gradlew --no-daemon --stacktrace --console=plain --continue --max-workers=2 \
      "${tasks[@]}" 2>&1 | tee "$log" || rc=1
  fi
  if [ -z "${GRADLE_PASSED:-}" ]; then :
  elif [ "$rc" = 0 ]; then printf '%s\n' "${dirs[@]}" >>"$GRADLE_PASSED"
  else
    # A member passes only when its own `check` is printed as run (`> Task :a:check`, with
    # UP-TO-DATE or FROM-CACHE after it); one skipped for a failed dependency prints nothing, one
    # that failed ends in FAILED. Anything else, a red build that printed no such line, fails.
    for i in "${!dirs[@]}"; do
      ! grep -qxE "> Task ${tasks[i]}( (UP-TO-DATE|FROM-CACHE|NO-SOURCE))?" "$log" || echo "${dirs[i]}" >>"$GRADLE_PASSED"
    done
  fi
  rm -f "$log"
  return "$rc"
}
declare -A batch=()  # root => its "<dir>:<task>" members, space-joined
alone=()                      # included builds: "<dir>:<parent>:-p <path> check"
for arg in "${@:-.}"; do
  dir=$(cd "$arg" && pwd)
  root=$(up "$dir")
  [ -n "$root" ] || die "$arg: no settings.gradle(.kts) at or above it"
  # A member holding its own settings under another build's is an included build. Its `check`
  # in the composite (:<build>:check) reaches only its root project, so it runs as a build of
  # its own, by the parent's wrapper.
  if [ "$root" = "$dir" ] && parent=$(up "$(dirname "$dir")") && [ -n "$parent" ]; then
    alone+=("$dir"$'\t'"$parent"$'\t'"-p ${dir#"$parent"/} check")
  else
    batch[$root]+="$dir"$'\t'"$(tr / : <<<"${dir#"$root"}"):check"$'\n'
  fi
done
rc=0
for root in "${!batch[@]}"; do
  mapfile -t ms <<<"${batch[$root]%$'\n'}"
  run "$root" "${ms[@]}" || rc=1
done
for a in "${alone[@]}"; do
  IFS=$'\t' read -r dir parent task <<<"$a"
  run "$parent" "$dir"$'\t'"$task" || rc=1
done
exit "$rc"
