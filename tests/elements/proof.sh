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
service_url=http://127.0.0.1:8398
placer_url=http://127.0.0.1:8397

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
serve "$service" factory_selftest 8398 CORS_ORIGINS=$placer_url

(cd "$placer/backend" && uv sync --no-default-groups)
cd "$placer/frontend"
pnpm install
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
serve "$placer" factory_placer 8397 ELEMENT_ORIGINS=$service_url

SERVICE_URL=$service_url PLACER_URL=$placer_url FRONTEND="$service/frontend" node "$factory/tests/elements/drive.mjs"
