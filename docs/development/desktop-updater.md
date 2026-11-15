# Desktop self-update

A desktop app stamped from `skeletons/desktop/` installs new versions of itself from its own signed GitHub releases. The pieces, each in the factory and consumed through its own API:

| Piece | Where |
| --- | --- |
| Check, download, install, relaunch, six-hourly re-check, toasts | `@poodle64/ui/updater` (`startUpdateChecks`, `checkForUpdate`, `getUpdaterState`, `downloadAndInstall`) |
| Outcome of each check as telemetry | `tauri-plugin-telemetry`'s `report_update_check` (in `telemetry:default`; the webview supplies two booleans, no text) |
| Plugin registration, capabilities, endpoint | the skeleton's `lib.rs`, `capabilities/default.json`, `tauri.conf.json` |
| Signed build, `latest.json`, draft then publish | the skeleton's `release.yaml` (`tauri-action`) |

The skeleton's layout starts the checks. An app shows the check in its own Settings pane from `getUpdaterState()` and a button calling `checkForUpdate()`.

## Each app mints its own keypair

The updater verifies a download against the public key in `tauri.conf.json`; a leaked private key signs updates for that app alone.

1. Mint it on a trusted machine, never in a session: `pnpm tauri signer generate -w <a file outside the repo>`. It asks for a password. Never print, commit or paste the private key.
2. Put the private key's contents and the password in the repository's secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, then delete the key file.
3. Put the `.pub` file's contents in `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.

The release's first step refuses a build with the key empty or either secret missing. A lost private key strands every installed copy: they can never be updated to a build signed by another key, so keep the key where the operator keeps backups.

## Cutting a release

`latest.json` carries the version in `src-tauri/tauri.conf.json`, never the tag's, so an app whose config says `0.1.0` publishes a release every installed copy calls up to date. The release's build job fails when the pushed tag (`v2026.11.1`) is not `v` plus that version. Before tagging, set `version` in `src-tauri/tauri.conf.json` (and `Cargo.toml`, `package.json`) to the tag's number, and merge it. The signed macOS bundles are verified by `scripts/tauri-release.sh` before `tauri-action` uploads anything.

## What an existing app changes

Every file below is app-owned (`_skip_if_exists`), so `copier update` does not touch it. Copy the skeleton's lines.

- `package.json`: `@poodle64/ui` `^2026.11.12`, `@tauri-apps/plugin-process`, `@tauri-apps/plugin-updater`; refresh the lockfile.
- `src-tauri/Cargo.toml`: `tauri-plugin-updater = "2.14"` and `tauri-plugin-process = "2"` under the non-mobile target table, and move `tauri-plugin-telemetry` to this release (version 0.2.0). A Nix-built app refreshes its `outputHashes` (`kits/rust/README.md`).
- `src-tauri/src/lib.rs`: register both plugins under `#[cfg(desktop)]`. Delete any `report_update_check` command of its own, and any updater store or telemetry call the app had.
- `src-tauri/capabilities/default.json`: `updater:default`, `process:allow-restart`.
- `src-tauri/tauri.conf.json`: `plugins.updater` with the app's pubkey and endpoint `https://github.com/<owner>/<repo>/releases/latest/download/latest.json`. Do not set `bundle.createUpdaterArtifacts`: the release passes it, so a local build needs no private key.
- `src/routes/+layout.svelte`: `onMount(startUpdateChecks)` from `@poodle64/ui/updater`. Import the store's functions from there in the Settings pane; delete the app's own `updater` store.
- `.github/workflows/release.yaml` and `scripts/tauri-release.sh` (the script is stamped; `copier update` brings it): the skeleton's `build` and `publish` jobs, or the app's own with `tauri-action`, the two secrets, and `--config '{"bundle":{"createUpdaterArtifacts":true}}'`. `latest.json` is uploaded to the release and found at `releases/latest/download/`, so the release must be published, not a draft. A release that builds with `pnpm tauri build` and uploads installers by hand (Bragi) swaps to `tauri-action`, which writes `latest.json`.

An app already shipping an updater (Thoth) keeps its public key and secrets, so installed copies keep updating; it changes only to the kit calls above.

## Platforms

- **macOS**: the updater replaces the `.app` with the `.app.tar.gz` the release builds. The bundle is signed by the runner's `APPLE_SIGNING_IDENTITY` (`scripts/cargo-codesign.sh`), so the designated requirement, and the Microphone and Accessibility grants keyed to it, survive an update. The release's last step verifies it.
- **Linux**: the updater replaces an AppImage only. The skeleton builds `.deb` and `.rpm` on the NixOS runner, where linuxdeploy cannot make an AppImage, so a Linux install is reinstalled by hand and its check reports no Linux platform. An app that ships an AppImage builds it on a runner that can, and its `latest.json` then carries Linux.

## Verified, and not

Verified here: the kit's tests, a fresh stamp's frontend `check` and `build`, and its Rust `cargo check`. Not verifiable without the app's secrets and a published release: a signed build, `latest.json`, and an installed copy updating itself. The first release of an adopting app is that drive: install the previous build, publish the next, check from the Settings pane.
