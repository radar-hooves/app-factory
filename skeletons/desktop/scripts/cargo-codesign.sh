#!/usr/bin/env bash
# Tauri's cargo runner: build, sign, verify, then execute without re-linking.
set -euo pipefail

if [[ "$(uname -s)" != Darwin ]]; then
    [[ "${1:-}" != check-bundle ]] || exit 0
    exec cargo "$@"
fi

command=${1:-}
case "$command" in
    build|run|check-bundle) shift ;;
    *) exec cargo "$@" ;;
esac

fail() { printf 'codesign: %s\n' "$1" >&2; exit 1; }
root="$(cd "$(dirname "$0")/.." && pwd)"
config="$root/src-tauri/tauri.conf.json"
identity=$(jq -er '. * (env.TAURI_CONFIG // "{}" | fromjson) | .bundle.macOS.signingIdentity |
    if . == null or . == "" then "-" elif type == "string" then . else error("Invalid identity") end' "$config" 2>/dev/null) \
    || fail 'Invalid bundle.macOS.signingIdentity in tauri.conf.json.'
[[ "$identity" == - || "$identity" =~ ^[[:xdigit:]]{40}$ ]] \
    || fail 'Pin the certificate SHA-1 fingerprint, not its display name.'
identifier=$(jq -er '. * (env.TAURI_CONFIG // "{}" | fromjson) | .identifier | select(type == "string" and . != "")' "$config" 2>/dev/null) \
    || fail 'Missing bundle identifier.'
# The bundler and runner must use the same identity; never auto-pick a certificate.
[[ -z "${APPLE_SIGNING_IDENTITY:-}" || "$APPLE_SIGNING_IDENTITY" == "$identity" ]] \
    || fail 'APPLE_SIGNING_IDENTITY disagrees with tauri.conf.json.'

build_args=()
app_args=()
release=false
if [[ "$command" == check-bundle && "${TAURI_ENV_DEBUG:-false}" != true ]]; then
    release=true
fi
while (($#)); do
    if [[ "$1" == -- && "$command" == run ]]; then
        shift
        app_args=("$@")
        break
    fi
    case "$1" in
        --message-format*) fail 'The signing runner owns cargo --message-format.' ;;
        --release|-r) release=true ;;
        --profile) [[ "${2:-}" == dev ]] || release=true ;;
        --profile=*) [[ "$1" == --profile=dev ]] || release=true ;;
        -*) [[ ! "$1" =~ ^-[vq]*r ]] || release=true ;;
    esac
    build_args+=("$1")
    shift
done

if [[ "$identity" == - ]]; then
    [[ "$release" == false ]] || fail 'Release builds require an existing stable certificate fingerprint.'
    printf 'codesign: local ad-hoc signing; identity changes on rebuild, releases require a stable certificate.\n' >&2
fi

[[ "$command" != check-bundle ]] || exit 0

messages=$(mktemp)
trap 'rm -f "$messages"' EXIT
# Cargo supplies the actual paths, including custom targets, profiles and target-dir.
cargo build "${build_args[@]}" --message-format=json-render-diagnostics \
    | tee "$messages" \
    | jq --unbuffered -r 'select(.reason == "compiler-message") | .message.rendered // empty' >&2

binaries=()
while IFS= read -r binary; do
    binaries+=("$binary")
done < <(jq -rs 'map(select(.reason == "compiler-artifact" and .executable != null
    and (.target.kind | index("bin")) and .profile.test == false) | .executable)
    | unique[]' "$messages")
((${#binaries[@]})) || fail 'Cargo produced no application binary.'
if [[ "$command" == run && ${#binaries[@]} != 1 ]]; then
    fail 'Select one application binary with --bin for tauri dev.'
fi

for binary in "${binaries[@]}"; do
    codesign --force --sign "$identity" --identifier "$identifier" "$binary"
    codesign --verify --strict "$binary"
done

if [[ "$command" == run ]]; then
    rm -f "$messages"
    trap - EXIT
    # A second cargo run can re-link and undo the signature. Tauri watches this PID.
    exec "${binaries[0]}" "${app_args[@]}"
fi
