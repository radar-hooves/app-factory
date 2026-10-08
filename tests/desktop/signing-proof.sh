#!/usr/bin/env bash
# Real runner proof: changed binaries retain the same certificate requirement.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]]
identity=${1:?Supply an existing certificate fingerprint}
[[ "$identity" =~ ^[[:xdigit:]]{40}$ ]]
source_root="$(cd "$(dirname "$0")/../.." && pwd)"
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
mkdir -p "$root/scripts" "$root/src-tauri/src"
cp "$source_root/skeletons/desktop/scripts/cargo-codesign.sh" "$root/scripts/"
printf '[package]\nname = "signing-proof"\nversion = "0.1.0"\nedition = "2021"\n' > "$root/src-tauri/Cargo.toml"
export APPLE_SIGNING_IDENTITY="$identity"
jq -n '{identifier: "com.example.factorysigningproof", bundle: {macOS: {signingIdentity: "-"}}}' > "$root/src-tauri/tauri.conf.json"
cd "$root/src-tauri"
binary="$root/src-tauri/target/debug/signing-proof"
first_requirement=''
first_hash=''
for version in 1 2; do
    printf 'fn main() { println!("version %s"); }\n' "$version" > src/main.rs
    bash ../scripts/cargo-codesign.sh build
    codesign --verify --strict --verbose=2 "$binary"
    requirement=$(codesign -dr - "$binary" 2>&1)
    printf '%s\n' "$requirement"
    printf '%s\n' "$requirement" | grep -qi "certificate leaf = H\"$identity\""
    hash=$(shasum -a 256 "$binary" | cut -d ' ' -f 1)
    if [[ "$version" == 1 ]]; then
        first_requirement=$requirement
        first_hash=$hash
    else
        [[ "$requirement" == "$first_requirement" ]]
        [[ "$hash" != "$first_hash" ]]
    fi
done
printf 'SIGNING_PROOF_PASSED: two changed binaries, one stable designated requirement\n'
