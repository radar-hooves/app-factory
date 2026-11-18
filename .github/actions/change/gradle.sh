#!/usr/bin/env bash
# Gradle members' leg: each project's `check` (Android's includes Lint), by the build's own
# wrapper. Several members of one build run as ONE invocation (`--continue`, two workers): the
# JVM start and the configuring of every project is most of a member's five minutes. A failing
# one is named from the build's own output into $GRADLE_FAILED (a file), one dir per line; a
# failed task no member owns names them all. A repo's exclusions and setup belong in its own
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
owns() {  # <task path> <member's check task>: the task is a direct one of that member's project
  local rest=${1#"${2%check}"}
  [ "$rest" != "$1" ] && [[ $rest != *:* ]]
}
run() {  # <root> <member-dir>:<task>... ; the tasks of one build, or `-p <path> check` alone
  local root=$1 tasks=() dirs=() m log failed=() t i owned rc=0
  shift
  for m; do dirs+=("${m%%:*}") tasks+=("${m#*:}"); done
  log=$(mktemp)
  if [ "${#tasks[@]}" -eq 1 ]; then
    # shellcheck disable=SC2086 # an included build's task is `-p <path> check`, split on purpose
    in_flake "$root" ./gradlew --no-daemon --stacktrace ${tasks[0]} || rc=1
  else
    in_flake "$root" ./gradlew --no-daemon --stacktrace --continue --max-workers=2 "${tasks[@]}" 2>&1 |
      tee "$log" || rc=1
    mapfile -t failed < <(sed -n "s/.*Execution failed for task '\([^']*\)'.*/\1/p" "$log" | sort -u)
  fi
  rm -f "$log"
  [ "$rc" = 0 ] || [ -z "${GRADLE_FAILED:-}" ] || {
    for i in "${!dirs[@]}"; do
      for t in "${failed[@]}"; do
        if owns "$t" "${tasks[i]}"; then echo "${dirs[i]}" >>"$GRADLE_FAILED"; break; fi
      done
    done
    # A failure no member owns, or none printed (a configuring error), names every member.
    owned=1
    for t in "${failed[@]}"; do
      for i in "${!dirs[@]}"; do owns "$t" "${tasks[i]}" && continue 2; done
      owned=
    done
    if [ -z "$owned" ] || [ "${#failed[@]}" -eq 0 ]; then printf '%s\n' "${dirs[@]}" >>"$GRADLE_FAILED"; fi
  }
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
  mapfile -t ms < <(printf %s "${batch[$root]}" | tr '\t' ':')
  run "$root" "${ms[@]}" || rc=1
done
for a in "${alone[@]}"; do
  IFS=$'\t' read -r dir parent task <<<"$a"
  run "$parent" "$dir:$task" || rc=1
done
exit "$rc"
