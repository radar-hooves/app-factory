#!/usr/bin/env bash
# Whether this push changes anything the image is built from: writes
# `changed=true|false` to $GITHUB_OUTPUT for deploy.yaml, and why to the run's
# summary. Run from the checkout's root.
#
# Compared against the commit of the last successful Deploy run on main. That run
# either shipped its commit or found it unchanged from one that did, so its build
# context is the live image's. Never `github.event.before`: a queued run that a
# newer push cancelled shipped nothing, and its changes would be stepped over.
#
# The build reads the context BuildKit is sent, so BuildKit decides: each changed
# path is touched into an empty context under this app's own .dockerignore and
# copied out of a FROM-scratch build, and any that arrive are image inputs. A
# path list here would be a second .dockerignore, and an app's tail re-includes
# paths no factory list can name (app-factory#16). The Dockerfile, the ignore
# file and deploy.yaml (what is built, how, and where it goes) ship on any change.
#
# Anything it cannot establish is a change: a wrong "true" costs one deploy, a
# wrong "false" a change that never ships.
set -euo pipefail

decide() {
  echo "changed=$1" >>"$GITHUB_OUTPUT"
  echo "$2" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
  exit 0
}

[ "$GITHUB_EVENT_NAME" = push ] || decide true "A ${GITHUB_EVENT_NAME} run always ships."

# Re-running an old run moves its start, not its place in the list.
base=$(gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/deploy.yaml/runs?branch=main&status=success&per_page=100" \
  --jq '[.workflow_runs[]] | max_by(.run_started_at) | .head_sha // empty') || base=
[ -n "$base" ] || decide true "No earlier successful Deploy run on main to compare with."

probe=$(mktemp -d)
trap 'rm -rf "$probe"' EXIT
git diff --name-only --no-renames -z "$base" HEAD >"$probe/paths" 2>/dev/null ||
  decide true "Commit $base is not in this checkout's history."
mapfile -d '' paths <"$probe/paths"
[ ${#paths[@]} -gt 0 ] || decide false "Nothing changed since $base, which is live."

mkdir "$probe/context" "$probe/out"
ignore=.dockerignore
[ ! -f Dockerfile.dockerignore ] || ignore=Dockerfile.dockerignore
[ ! -f "$ignore" ] || cp "$ignore" "$probe/context/.dockerignore"
for path in "${paths[@]}"; do
  case "$path" in
    Dockerfile | .dockerignore | Dockerfile.dockerignore | .github/workflows/deploy.yaml) decide true "$path changed." ;;
  esac
  { mkdir -p "$probe/context/$(dirname -- "$path")" && : >"$probe/context/$path"; } 2>/dev/null ||
    decide true "$path cannot be laid out to probe."
done
printf 'FROM scratch\nCOPY . /\n' >"$probe/Dockerfile"
docker buildx build --builder default --progress quiet --output "type=local,dest=$probe/out" \
  -f "$probe/Dockerfile" "$probe/context" >"$probe/log" 2>&1 || {
  cat "$probe/log"
  decide true "The build-context probe failed."
}

inputs=$(cd "$probe/out" && find . -type f ! -path ./.dockerignore | sed 's|^\./||' | sort)
[ -z "$inputs" ] || decide true "$(printf 'Image inputs changed since %s:\n%s' "$base" "$inputs")"
decide false "Nothing the image is built from changed since $base, which is live: no checks, no build, no deploy."
