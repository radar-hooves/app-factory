#!/usr/bin/env bash
# Tauri's cargo runner: build, sign, verify, then execute without re-linking.
set -euo pipefail

if [[ "$(uname -s)" != Darwin ]]; then
    exec cargo "$@"
fi

command=${1:-}
case "$command" in
    build|run) shift ;;
    *) exec cargo "$@" ;;
esac

fail() { printf 'codesign: %s\n' "$1" >&2; exit 1; }
root="$(cd "$(dirname "$0")/.." && pwd)"
config="$root/src-tauri/tauri.conf.json"
identity=$(jq -er '.bundle.macOS.signingIdentity | select(type == "string" and . != "" and . != "-")' "$config") \
    || fail 'Declare an existing stable bundle.macOS.signingIdentity in tauri.conf.json.'
[[ "$identity" =~ ^[[:xdigit:]]{40}$ ]] || fail 'Pin the certificate SHA-1 fingerprint, not its display name.'
identifier=$(jq -er '.identifier | select(type == "string" and . != "")' "$config") \
    || fail 'Missing bundle identifier.'
# The bundler and runner must use the same identity; never auto-pick a certificate.
[[ -z "${APPLE_SIGNING_IDENTITY:-}" || "$APPLE_SIGNING_IDENTITY" == "$identity" ]] \
    || fail 'APPLE_SIGNING_IDENTITY disagrees with tauri.conf.json.'

build_args=()
app_args=()
while (($#)); do
    if [[ "$1" == -- && "$command" == run ]]; then
        shift
        app_args=("$@")
        break
    fi
    case "$1" in
        --message-format*) fail 'The signing runner owns cargo --message-format.' ;;
    esac
    build_args+=("$1")
    shift
done

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
