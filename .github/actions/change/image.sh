#!/usr/bin/env bash
# An image member's deploy: build once on the household builder, pushing :<sha> from BuildKit, pull and smoke it,
# point :latest at it, have the host's stack-up recreate this host's containers of :latest on it
# and on their declared compose config, then watch them come up healthy on that very image.
# A failed or interrupted go-live points :latest back at the digest it replaced, has stack-up
# recreate them again and watches that too. Its state waits in $RUNNER_TEMP until then, so
# `--rollback`, the deploy job's step after a cancel or a failure, finishes what a killed run could not.
# A container labelled household.run-from-source=true is its host's to move onto a new image:
# none is counted, recreated or watched, here or in a rollback.
# The build context is the member, or the repo-relative `[tool.change] context` its
# pyproject.toml declares; the Dockerfile is always the member's own. Its `secrets` table
# maps a BuildKit secret id to the runner environment variable naming the file that holds it
# (`secrets = { npmrc = "NPM_CONFIG_USERCONFIG" }`); `netrc` is $NETRC unless declared.
# The image ref is <registry>/<owner>/<name>, lowercased.
# A phase splits the work across two runners: `build` builds and pushes :<sha> from BuildKit, then pulls and smokes it;
# `release` (on the host that runs it) points :latest at that :<sha> and goes live. Without
# one, a single runner does both.
# Where the host keeps its locks, two runs rolling one image here take turns: the second waits,
# then skips when this host already runs its commit or a newer one. A build phase only waits.
# A host without the directory (or flock) rolls unlocked.
# Usage: image.sh <member-dir> <image-name> <sha> [build|release]
#        image.sh <member-dir> <image-name> --rollback
. "$(dirname "$0")/lib.sh"
. "$(dirname "$0")/live.sh"
dir=$(cd "$1" && pwd) name=${2,,} sha=$3 phase=${4:-all}
case $phase in all | build | release) ;; *) die "unknown phase '$phase'" ;; esac
[ "$sha" != --rollback ] || phase=release
need CHANGE_REGISTRY CHANGE_REGISTRY_CREDENTIAL_FILE
files=(CHANGE_REGISTRY_CREDENTIAL_FILE)
if [ "$phase" != release ]; then
  cfg='{}'
  [ ! -f "$dir/pyproject.toml" ] || cfg=$(python3 -c 'import json, sys, tomllib; print(json.dumps(tomllib.load(open(sys.argv[1], "rb")).get("tool", {}).get("change", {})))' "$dir/pyproject.toml")
  declare -A secret_env=([netrc]=NETRC)
  rows=$(jq -r '(.secrets // {}) | to_entries[] | [.key, (.value | tostring)] | @tsv' <<<"$cfg") ||
    die "[tool.change] secrets must be a table of secret id to environment variable name"
  while IFS=$'\t' read -r id var; do
    [ -n "$id" ] || continue
    [[ $id =~ ^[A-Za-z0-9_.-]+$ && $var =~ ^[A-Z_][A-Z0-9_]*$ ]] || die "[tool.change] secrets: '$id' = '$var' needs an id and an UPPER_CASE environment variable name"
    secret_env[$id]=$var
  done <<<"$rows"
  secrets=()
  for id in "${!secret_env[@]}"; do
    need "${secret_env[$id]}"
    files+=("${secret_env[$id]}")
    secrets+=(--secret "id=$id,src=${!secret_env[$id]}")
  done
fi
if [ "$phase" != build ]; then
  need CHANGE_STACK_UP
fi
for f in "${files[@]}"; do
  [ -r "${!f}" ] || die "$f (${!f}) is not readable by $(id -un)"
done
ref=$CHANGE_REGISTRY/$(printf %s "${GITHUB_REPOSITORY_OWNER:-radar-hooves}" | tr A-Z a-z)/$name
state=${RUNNER_TEMP:-${TMPDIR:-/tmp}}/change-image-$name.rollback
# A signal exits through the EXIT trap, so whatever is armed there runs.
trap 'exit 130' INT
trap 'exit 143' TERM

# No smoke script: the image must start, and pass its healthcheck, or with none stay up 20 s.
boot() {  # <image>
  local s i ok=1
  box=change-smoke-${GITHUB_RUN_ID:-local}-$$-$RANDOM
  trap 'docker rm -f "$box" >/dev/null 2>&1 || true' EXIT
  docker run -d --name "$box" "$1" >/dev/null || return
  for i in $(seq 60); do
    sleep 2
    s=$(docker inspect --format '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$box")
    case $s in
      running/starting) continue ;;
      running/none) [ "$i" -ge 10 ] || continue; ok=0 ;;
      running/healthy) ok=0 ;;
    esac
    break
  done
  [ "$ok" = 0 ] || { docker logs --tail 50 "$box" 2>&1; echo "smoke: $1 is $s, not up and healthy" >&2; }
  docker rm -f "$box" >/dev/null
  trap - EXIT
  return "$ok"
}

# The password goes from its file to stdin, never through a variable or argv.
login() {
  cut -d: -f2- "$CHANGE_REGISTRY_CREDENTIAL_FILE" |
    docker login "$CHANGE_REGISTRY" -u "$(cut -d: -f1 "$CHANGE_REGISTRY_CREDENTIAL_FILE")" --password-stdin >/dev/null
}

# running()'s rows on stdin that this pipeline moves: not a source-run one, whose host
# adopts a new image itself, holding off while a job runs inside.
moved() { awk -F'\t' '$6 != "true"'; }

# `CHANGE_STACK_UP <container>...` pulls each one's image, then, holding its stack's lock as
# every recreator on the host does, recreates its compose service when the image its tag
# names or its declared config moved (yggdrasil's stack-up). A rollback restores the image
# alone; reverting config is reverting its commit.
stack_up() { [ "$before" -eq 0 ] || "$CHANGE_STACK_UP" "${names[@]}"; }

# The registry answers :latest with digest $1, within a minute: stack-up pulls it moments later.
serves() {
  local i d
  # An absent digest would match an absent read.
  case $1 in "" | null) die "no digest to wait for $ref:latest to answer with" ;; esac
  for i in $(seq 12); do
    d=$(docker buildx imagetools inspect --format '{{json .Manifest}}' "$ref:latest" 2>/dev/null | jq -r .digest) || d=
    [ "$d" = "$1" ] && return 0
    sleep 5
  done
  echo "the registry still answers $ref:latest with ${d:-nothing}, not $1" >&2
  return 1
}

# As many containers of :latest here as before that this pipeline moves, each on image $1 (on any
# image but X when $1 is !X) and healthy or running; when one has no healthcheck, all
# unchanged 30 s on.
up() {  # <image id, or !id>
  local a b
  a=$(running "$ref" | moved | sort) || return
  awk -F'\t' -v n="$before" -v w="$1" '(w ~ /^!/ ? $5 == substr(w, 2) : $5 != w) || $2 !~ /^(healthy|running)$/ {bad = 1}
    END {exit bad || NR < n}' <<<"$a" || return
  grep -q $'\trunning\t' <<<"$a" || return 0
  sleep 30
  b=$(running "$ref" | moved | sort) && [ "$a" = "$b" ]
}

watch() {  # <image id, or !id>: up within 5 minutes
  local end=$((SECONDS + 300))
  until up "$1"; do
    [ "$SECONDS" -lt "$end" ] || {
      echo "after 5 minutes, $ref:latest here is (revision, health, container, restarts, image, run-from-source):" >&2
      running "$ref" >&2
      return 1
    }
    sleep 10
  done
}

# Puts :latest back at the digest it replaced, has stack-up recreate, watches this host return to
# the image it ran, and says what is true.
rollback() {
  trap '' INT TERM
  trap - EXIT
  local was="$name $sha did not go live"
  if [ -z "$prev" ]; then
    rm -f "$state"
    echo "$was; there was no :latest before it, so :latest stays $sha" >&2
    return 1
  fi
  if ! { login && docker buildx imagetools create --prefer-index=false -t "$ref:latest" "$ref@$prev"; }; then
    echo "$was, and restoring :latest to $prev failed: :latest is still $sha" >&2
    return 1
  fi
  # The state stays until this host is back, so a later --rollback asks and watches again.
  serves "$prev" || true
  stack_up || { echo "$was; :latest is back at $prev, but stack-up failed, so this host may still run $sha" >&2; return 1; }
  [ "$held" -eq 0 ] || note "$was; :latest is back at $prev, for this host to adopt in its $held source-run container(s) of it"
  if [ "$before" -eq 0 ]; then
    rm -f "$state"
    [ "$held" -gt 0 ] || note "$was; :latest is back at $prev. Nothing runs it on this host, so the restore is unverified here"
    return 0
  fi
  watch "${oldimg:-!$img}" || { echo "$was; :latest is back at $prev, but this host did not come back healthy on its previous image" >&2; return 1; }
  rm -f "$state"
  note "$was; :latest is back at $prev, and this host is healthy on ${old:-its previous image} again"
}

tree() {  # <pid>: its descendants, deepest first, then itself
  local c kids
  kids=$(cat /proc/"$1"/task/*/children 2>/dev/null || true)
  for c in $kids; do tree "$c"; done
  echo "$1"
}

if [ "$sha" = --rollback ]; then
  [ -f "$state" ] || { note "$name: nothing to roll back"; exit 0; }
  # shellcheck source=/dev/null
  . "$state"
  # The run that wrote it outlives a cancelled step: stop it and all it started first.
  if grep -qsa image.sh "/proc/$pid/cmdline"; then
    mapfile -t pids < <(tree "$pid")
    kill -KILL "${pids[@]}" 2>/dev/null || true
  fi
  if rollback; then exit 0; fi
  exit 1
fi

locks=${CHANGE_LOCKS:-/var/lib/ci-locks}
if [ -d "$locks" ] && command -v flock >/dev/null; then
  exec 9>"$locks/image-$name.lock"
  flock 9
fi
if [ "$phase" != build ]; then
  cur=$(running "$ref" | sole 1)
  if [ -n "$cur" ] && git -C "$dir" cat-file -e "$cur^{commit}" 2>/dev/null && git -C "$dir" merge-base --is-ancestor "$sha" "$cur"; then
    note "$name: this host already runs $cur, which is $sha or newer; skipping"
    exit 0
  fi
fi

if [ "$phase" != release ]; then
  ctx=$dir
  c=$(jq -r '.context // ""' <<<"$cfg")
  [ -z "$c" ] || ctx=$(cd "$(git -C "$dir" rev-parse --show-toplevel)/$c" && pwd)
  # Two first deploys may race to create it: the loser takes the winner's.
  docker buildx inspect household >/dev/null 2>&1 ||
    docker buildx create --name household --driver docker-container --driver-opt network=host >/dev/null ||
    docker buildx inspect household >/dev/null 2>&1 ||
    die "cannot create the household builder"
  login
  timed "image build+push" docker buildx build --builder household --push --provenance=false --sbom=false --pull --build-arg "GIT_SHA=$sha" \
    "${secrets[@]}" -f "$dir/Dockerfile" -t "$ref:$sha" "$ctx"
  docker pull -q "$ref:$sha" >/dev/null
  img=$(docker image inspect --format '{{.ID}}' "$ref:$sha")
  [ "$(docker image inspect --format "$revision" "$ref:$sha")" = "$sha" ] ||
    die "$ref:$sha does not carry REVISION=$sha (its Dockerfile needs ARG GIT_SHA and ENV REVISION=\${GIT_SHA}), so no watch could see it go live; not released"

  probe=$dir/.github/image-smoke.sh
  [ -f "$probe" ] || probe=$dir/image-smoke.sh
  if [ -f "$probe" ]; then
    timed "image smoke" env IMAGE=$ref:$sha bash "$probe" || die "smoke: ${probe#"$dir"/} failed on $ref:$sha; not released"
  else
    timed "image smoke" boot "$ref:$sha" || die "smoke: $ref:$sha did not come up; not released"
  fi
else
  # Built elsewhere: the image id a container here runs is the config digest of the :<sha> manifest.
  login
  manifest=$(docker buildx imagetools inspect --raw "$ref:$sha") || die "cannot read $ref:$sha; the build job pushes it first"
  img=$(jq -r '.config.digest // empty' <<<"$manifest")
  [ -n "$img" ] || die "$ref:$sha is not a single-platform manifest, so no watch could tell its image"
fi

[ "$phase" != build ] || exit 0
if out=$(docker buildx imagetools inspect --format '{{json .Manifest}}' "$ref:latest" 2>&1); then
  prev=$(jq -r .digest <<<"$out")
else
  grep -q 'not found' <<<"$out" || die "cannot read $ref:latest: $out"
  prev=
fi
rows=$(running "$ref")
taken=$(moved <<<"$rows")
before=$(grep -c . <<<"$taken" || true)
held=$(($(grep -c . <<<"$rows" || true) - before))
live=$(sole 1 <<<"$rows") old=$(sole 1 <<<"$taken") oldimg=$(sole 5 <<<"$taken")
mapfile -t names < <(cut -f7 <<<"$taken" | sed -n 's#^/##p')
# A re-run of an older run must never roll production back, a source-run container's included.
[ -z "$live" ] || [ "$live" = "$sha" ] || no_rollback "$dir" "$name" "$live" "$sha" || exit 1

pid=$$
declare -p ref name sha img prev old oldimg before held names pid >"$state"
trap 'rollback || :; exit 1' EXIT
# Moved in the registry, not by a local tag: the live stacks share this daemon's :latest.
docker buildx imagetools create --prefer-index=false -t "$ref:latest" "$ref:$sha"
serves "$(docker buildx imagetools inspect --format '{{json .Manifest}}' "$ref:$sha" | jq -r .digest)" ||
  die "$ref:latest did not move to $sha"
stack_up || die "the host's stack-up did not recreate $name's containers on $sha"
[ "$held" -eq 0 ] || note "$ref:latest is $sha, for this host to adopt in its $held source-run container(s) of it"
if [ "$before" -gt 0 ]; then
  watch "$img" || die "$name $sha did not come up healthy on this host"
  note "$ref:latest is $sha, healthy on this host"
elif [ "$held" -eq 0 ]; then
  note "nothing runs $ref:latest on this host, so nothing here verifies it: :latest is $sha, unverified on this host"
fi
rm -f "$state"
trap - EXIT
