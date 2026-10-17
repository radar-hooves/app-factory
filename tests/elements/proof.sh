#!/usr/bin/env bash
# One element, two placements, in a real browser (factory-selftest.yaml). The
# self-test render serves <selftest-card> (template/frontend/src/elements/); a
# second, ordinary stamp in another palette places it with its one line, typed
# from the service's own build; both pages must render it in the kit, each in
# its own palette (drive.mjs).
#
#   tests/elements/proof.sh <self-test render>   # dependencies installed, as CI leaves it
#
# Both pages sit outside (protected)/: the proof has no forward-auth and no
# database to sign anyone in, and placing an element is the same on any page.
set -euo pipefail

factory=$(cd "$(dirname "$0")/../.." && pwd)
service=$(realpath "$1")
placer="${service}-placer"
# Two ports the host has free now: a run beside this one on a shared runner holds others.
read -r service_port placer_port < <(python3 -c '
import socket
held = [socket.socket() for _ in range(2)]
for s in held: s.bind(("127.0.0.1", 0))
print(*(s.getsockname()[1] for s in held))')
service_url=http://127.0.0.1:$service_port
placer_url=http://127.0.0.1:$placer_port

rm -rf "$placer"
uvx copier copy --defaults --trust --vcs-ref=HEAD --quiet \
	--data project_name=factory-placer \
	--data description="Factory self-test placing app — never deployed" \
	--data backend_port=8397 --data frontend_port=5197 --data frontend_e2e_port=5227 \
	--data postgres_host=127.0.0.1 --data postgres_port=5432 \
	--data portcullis_url=http://127.0.0.1:1 \
	--data private_index_name=godswood --data private_index_url=http://172.21.0.2:3141/poodle64/prod/+simple/ \
	--data registry_host=registry.invalid --data registry_credential_file=/dev/null \
	--data watchtower_url=http://127.0.0.1:1 \
	"$factory" "$placer"

# The placer's one palette knob, its accent, moved off the factory default.
sed -i 's/oklch(\(0\.[0-9]*\) 0\.12 145)/oklch(\1 0.16 25)/' "$placer/frontend/src/app.css"

page=src/routes/proof/+page.svelte
mkdir -p "$(dirname "$service/frontend/$page")" "$(dirname "$placer/frontend/$page")"
echo '<selftest-card></selftest-card>' >"$service/frontend/$page"
echo '<selftest-card app="factory-placer" count={3}></selftest-card>' >"$placer/frontend/$page"

# No identity to vend under and no database to reach: neither page needs one.
pids=()
trap 'kill "${pids[@]}" 2>/dev/null || true' EXIT
serve() { # <app dir> <package> <port> [VAR=value...]
	local dir=$1 package=$2 port=$3
	shift 3
	(cd "$dir/backend" && env "${package^^}_VEND=off" DATABASE__POSTGRES_PORT=1 "$@" \
		uv run --no-sync uvicorn --factory "$package.main:create_app" --host 127.0.0.1 --port "$port") &
	pids+=($!)
	timeout 60 sh -c "until curl -sf -o /dev/null http://127.0.0.1:$port/openapi.json; do sleep 1; done"
}

(cd "$service/frontend" && pnpm build)
serve "$service" factory_selftest "$service_port" CORS_ORIGINS=$placer_url

# The kits as the self-test render took them, from this checkout, not the indexes.
(
	cd "$placer/backend"
	for kit in "$factory"/kits/python/*/; do uv add --frozen --editable "$kit"; done
	uv sync --no-default-groups
)
cd "$placer/frontend"
pnpm add "@poodle64/ui@$(node -p "require('$service/frontend/package.json').dependencies['@poodle64/ui']")"
pnpm exec svelte-kit sync
ELEMENT_ORIGINS=$service_url pnpm generate:elements
# The derived types bind: a word where the element declares a number fails the check.
mkdir -p src/routes/proof/wrong
echo '<selftest-card count="three"></selftest-card>' >src/routes/proof/wrong/+page.svelte
if refused=$(pnpm check 2>&1); then
	echo 'FAIL the placer type-checks count="three" against a Number attribute' >&2
	exit 1
fi
grep -q 'proof/wrong/+page.svelte' <<<"$refused" || { echo "$refused" >&2; exit 1; }
rm -r src/routes/proof/wrong
pnpm check
pnpm build
serve "$placer" factory_placer "$placer_port" ELEMENT_ORIGINS=$service_url

SERVICE_URL=$service_url PLACER_URL=$placer_url FRONTEND="$service/frontend" node "$factory/tests/elements/drive.mjs"
