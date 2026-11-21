#!/usr/bin/env bash
# A group leg: several members run one after another on one runner (plan.sh's `groups`), each
# its own test leg and, on a shipping run, its own wait and deploy. A member that fails never
# stops the rest; the leg ends red naming every one that failed. Gradle members run first, in
# batches of six per invocation (gradle.sh confirms each green member from the build's output), and
# every member's flake shell is one profile realised once (lib.sh's in_flake), never a fetch
# per member.
# Usage: group.sh   (env: MEMBERS the group's plan rows as JSON, HEAD_SHA, SHIP, CHANGE_*)
. "$(dirname "$0")/lib.sh"
need MEMBERS HEAD_SHA
ship=${SHIP:-false} failed=()
CHANGE_FLAKE_ROOTS=$(mktemp -d) GRADLE_PASSED=$(mktemp)
export CHANGE_FLAKE_ROOTS GRADLE_PASSED
trap 'rm -rf "$CHANGE_FLAKE_ROOTS" "$GRADLE_PASSED"' EXIT
declare -A done_rc=()
# `-` for no base: read's tab IFS folds an empty field into its neighbour.
rows=$(jq -r '.[] | [.name, (.path | if . == "" then "." end), .toolchain, .test, .deploy, .deploy_now,
  .workers, (.base // "-"), (.waits | join(" "))] | @tsv' <<<"$MEMBERS")
gnames=() gpaths=()
while IFS=$'\t' read -r name path toolchain test _; do
  [ "$toolchain" = gradle ] && [ "$test" = true ] || continue
  gnames+=("$name") gpaths+=("$path")
done <<<"$rows"
for ((i = 0; i < ${#gnames[@]}; i += 6)); do
  echo "::group::gradle ${gnames[*]:i:6}"
  : >"$GRADLE_PASSED"
  "$here/gradle.sh" "${gpaths[@]:i:6}" || true
  # A member passes only when gradle.sh confirmed it; a failed, skipped or unnamed one fails.
  for ((j = i; j < i + 6 && j < ${#gnames[@]}; j++)); do
    done_rc[${gnames[j]}]=1
    ! grep -qxF "$(cd "${gpaths[j]}" && pwd)" "$GRADLE_PASSED" || done_rc[${gnames[j]}]=0
  done
  echo "::endgroup::"
done
while IFS=$'\t' read -r name path toolchain test deploy now workers base waits; do
  echo "::group::$name"
  rc=0
  [ "$base" != - ] || base=
  if [ -n "${done_rc[$name]:-}" ]; then rc=${done_rc[$name]}
  else [ "$test" != true ] || CHANGE_BASE=$base CHANGE_WORKERS=$workers "$here/$toolchain.sh" "$path" || rc=1
  fi
  if [ "$rc" = 0 ] && [ "$ship" = true ] && [ "$now" = true ] && [[ $deploy =~ ^(wheel|mcp)$ ]]; then
    # Per member, as the single leg's steps are: 26 minutes to wait, 20 to deploy.
    [ -z "$waits" ] || timeout 1560 "$here/wait.sh" "$path" $waits || rc=1
    [ "$rc" = 1 ] || timeout 1200 "$here/$deploy.sh" "$path" "$name" "$HEAD_SHA" || rc=1
  fi
  echo "::endgroup::"
  [ "$rc" = 0 ] || failed+=("$name")
done <<<"$rows"
for n in "${failed[@]}"; do echo "::error title=test $n failed::$n failed in ${GROUP:-its group}"; done
[ "${#failed[@]}" -eq 0 ] || die "${#failed[@]} failed: ${failed[*]}"
