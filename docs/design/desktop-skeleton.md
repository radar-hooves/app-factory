# Desktop skeleton

Thoth and Bragi stamp from one source, `skeletons/desktop/`, and take their shared code as kits (app-factory#1, rulings 1 and 2; built on the operator's ruling of 01/10/2026). A change made once here reaches both on their next converge.

## Layout

```text
copier.yaml                 one config; `skeleton` picks the tree (default web)
template/                   the web skeleton, where master's parity, converge and fleet tools read it
skeletons/desktop/          the desktop skeleton; a symlink into template/ where web and desktop share a file
kits/rust/desktop-shell     traffic lights, the tray guard, owner-only secret files and the main window
skeletons/desktop/scripts/webkit-layout   headless WebKit layout harness and per-app view sweep (desktop-pitfalls.md)
```

Copier reads a git source's config from its root alone, so both skeletons answer one `copier.yaml`, and `_subdirectory` is rendered from the `skeleton` answer. A web app's answers file predates the question, takes the default, and renders byte-identical to before (proven against casefile's answers: 212 files identical, the answers file gains `skeleton: web`). `template/` becomes `skeletons/web/` in one move once master's canonical-app-migration tools read the path from `_subdirectory` instead of hard-coding `template/`.

A symlink copier follows is how the two skeletons share a source: the drift and craft lints, the stylelint and TypeScript configs, the dark-first seed, the test harness. The design-craft lint is the one shared file that differs by skeleton: a desktop app has no phone width. `app.html` is the desktop's own: a webview has no tab icon or web manifest, and no backend serves `/elements/`.

## What lives where

| | Kit (versioned, pinned per app) | Skeleton-owned (stamped, converged) | App-owned (first stamp, then the app's) |
| --- | --- | --- | --- |
| Rust shell | `desktop-shell`: `traffic_lights::setup(window)`, `guard_tray`, `secrets`, `window`; `telemetry` and `tauri-plugin-telemetry` | `src-tauri/src/main.rs` | `lib.rs` and every module; `Cargo.toml`; `build.rs` |
| Tauri config | | | `tauri.conf.json` (windows, CSP, bundle, updater key), `capabilities/` |
| Frontend shell | `@poodle64/ui`, `@poodle64/design-tokens` | `vite.config.ts` (the SvelteKit options, port from answers), `vitest.config.ts`, `tsconfig.json`, `components.json`, `.npmrc`, `src/app.html`, `src/routes/+layout.ts`, `src/lib/utils.ts`, `src/test/setup.ts` | `package.json`, `src/app.css` (palette), routes and components |
| Settings pane | the telemetry section: next, into `@poodle64/ui` once `@poodle64/ui/settings` lands | | the pane's other sections |
| CI | | `.github/workflows/change.yaml`, master's one caller copied unchanged (no `ci.yaml`, no `security.yaml`: the weekly scan is master's) | `release.yaml`: stamped with its gate, a green `change` run on the tagged commit, then the signed build and publish jobs, the app's to extend; `.claude/CLAUDE.md` |
| macOS signing | | `scripts/cargo-codesign.sh`: build/sign/verify; read-only final bundle verification; explicit local ad-hoc mode; releases/configured signing fail closed; execute the signed dev binary | `tauri.conf.json`: runner and local `signingIdentity: "-"`; build host declares `APPLE_SIGNING_IDENTITY` for both signers; `flake.nix`: `jq` |
| Updater | `@poodle64/ui/updater`; `tauri-plugin-telemetry`'s `report_update_check` | `scripts/publish-release.sh`, `scripts/tauri-release.sh` | `tauri.conf.json` (`plugins.updater`), `lib.rs`, `capabilities/`, `+layout.svelte`: `desktop-updater.md` |
| Lints and formatters | | `stylelint.config.js`, the drift and craft lints, `.pre-commit-config.yaml` | the lints' baselines |
| Version | | `scripts/bump-version.sh` | `package.json`: the one source `flake.nix` reads |
| Nix hashes | | `scripts/update-pnpm-deps-hash.sh`, `scripts/update-kit-hash.sh` | `flake.nix`'s `kitHash` and `pnpmDeps` hash |
| Repo | | `.gitignore`, `.gitattributes`, `.envrc`, `renovate.json`, `.vscode/extensions.json` | `flake.nix`, `README.md`, `CHANGELOG.md`, `docs/`, `.claude/` |

The owned set is what the skeleton renders minus copier's `_skip_if_exists`. An app customises by mounting (calling a kit where its own setup wants it), configuring (its answers: `frontend_port`, `bundle_identifier`, `dark_first`) and adding (its own modules, routes, workflows, and a `.gitignore` inside any directory only it has).

Known traps and their fixes: `desktop-pitfalls.md`.

## Signing verification — 08/10/2026

The signing runner's 28 contract tests pass, including the single host-declared `APPLE_SIGNING_IDENTITY` fingerprint, certificate-free local builds, fail-closed release/custom profiles, both Mac target artefact paths, effective Tauri configuration, controlled parse errors and Linux's no-op bundle preflight. The public tree pins no certificate; Tauri CLI 2.11.4 reads the same environment declaration for final bundle signing. A real Tauri release-bundle invocation with effective ad-hoc identity failed in the preflight with the intended policy refusal, before signing. A native Cargo fixture confirmed that neither `CARGO_PROFILE=release` nor a `build` alias selects release; CLI profile flags do. The factory self-test's full Python kit suites, rendered backend and frontend gates passed with CI's installs. A committed skeleton compiled on huginn using Bragi's existing lockfile inputs; fresh input downloads were blocked by Nix cache transport failures.

Huginn's existing `poodle64` identity (`104B085265F9E2BBE7BBFA15C289B55363E529E0`) has a software private key in `~/Library/Keychains/login.keychain-db`, not a PIV/signet key. Native Security queries found that keychain locked in SSH's security session and unlocked in the GUI login session. A temporary GUI launchd proof signed the compiled skeleton without unlocking a keychain or changing credentials, ACLs or trust. `codesign --verify --strict --verbose=2` returned **valid on disk** and **satisfies its Designated Requirement**; the requirement binds `com.example.signingproof` to that certificate leaf. The proof job was removed.

Yggdrasil's declared runner now uses a GUI user agent and the real user HOME for identity discovery, with explicit isolated Cargo/XDG data homes. GUI context alone was insufficient: the first runner attempt found no identity under its private HOME. [The second real huginn runner attempt](https://github.com/radar-hooves/app-factory/actions/runs/37732878586/attempts/2) passed on 08/10/2026: two changed Rust binaries through the actual factory Cargo runner, two strict verifications returning **valid on disk** and **satisfies its Designated Requirement**, different binary hashes and identical certificate-leaf designated requirements. The factory self-test's opt-in `macos-signing-identity` dispatch input retains that proof. Desktop CI on main honours the declared Cargo home rather than overriding it. A full `.app` build also remains unproved: the scratch install resolved JavaScript Tauri API 2.12.1 against native Tauri 2.11.6, and the CLI rejected that mismatch before signing. Privacy-grant survival still needs the apps' signed in-place-update drive test.

App-owned Mac release jobs run `bash scripts/cargo-codesign.sh verify-bundles "$BUNDLE_DIRECTORY"` immediately after bundling, once per architecture. This read-only step strict-verifies every `.app` and nested Mach-O file and checks the designated certificate leaf against `APPLE_SIGNING_IDENTITY`; absent bundles or failed checks fail the job. Successful checks stay in the job log. The skeleton's release job runs this one shared step, not another publisher or signer. Final signed app-bundle proof remains with each app's release job.

The proposed shared desktop layer is `desktop-layer.md`; no app adoption is included here.

## Not built, and why

- **One release workflow for every app.** Each app's legs differ (runners, targets, toolchains), so `release.yaml` is the app's; what every app's release must do is in the stamped scripts it calls (`docs/development/desktop-updater.md`).
- **The telemetry settings section.** Both apps render the plugin's `get`/`set`/`probe` in different components. It belongs beside the settings page `@poodle64/ui/settings` is becoming, which another lane is building now.
- **A Nix kit.** Both flakes share a shape (a rust-overlay toolchain, `buildRustPackage` over `src-tauri`, `fetchPnpmDeps`) but little text; Thoth's carries CUDA, Bragi's mpv. A first stamp gets a devShell, plus a `packages.default` that evaluates once the app commits `pnpm-lock.yaml` and `src-tauri/Cargo.lock` (`cargo-tauri.hook`, `fetchPnpmDeps`); CUDA, mpv and the like are the app's to add.

## Version and hashes

`package.json` holds the version. `scripts/bump-version.sh X.Y.Z` copies it to `src-tauri/Cargo.toml`, `Cargo.lock`'s entry for the app and `tauri.conf.json` (`release.yaml` compares the tag to that one); `--check` fails when a copy differs. `flake.nix` reads `package.json`, so it holds no fourth copy.

The kit crates (`desktop-shell`, `telemetry`, `tauri-plugin-telemetry`) are git dependencies of this one repository. `flake.nix` derives their `outputHashes` keys from `Cargo.lock` and gives every one `kitHash`; after a kit bump, `scripts/update-kit-hash.sh` sets it to the source tree of the revision `Cargo.lock` pins (`--check` for CI). `pnpmDeps` is `update-pnpm-deps-hash.sh`'s, as before.

## Moving an existing app onto the stamp

Thoth and Bragi were copied before the skeleton existed, so neither has a stamp record. One package per app:

1. **Answers file.** On a clean tree, `copier copy --data skeleton=desktop --vcs-ref=<latest tag> --overwrite gh:radar-hooves/app-factory .`, answering `project_name`, `project_title`, `description`, `frontend_port` and `bundle_identifier` from the app's own config. This writes `.copier-answers.yml`; every later `copier update` reads it. A first-stamp file is skipped when it exists (`_skip_if_exists`), so the app's `package.json`, `flake.nix`, `Cargo.toml`, `tauri.conf.json`, `lib.rs`, `app.css`, routes and baselines survive; the skeleton-owned files are overwritten and `git diff` is the worklist.
2. **Reconcile each skeleton-owned file** by taking the template unless the app's version is domain code, then record every departure that remains in step 3. Typical ones: a missing `cargo-clippy` or `actionlint` hook, stale UI-drift and design-craft forks (take the template's), TypeScript and edition drift, Bragi's `atlas`/`huginn` runner labels in `release.yaml`, a missing `update-pnpm-deps-hash.sh`, Renovate holds naming the retired SvelteKit 3 reason.
3. **Parity record.** `household-precommit-template-parity --generate .` writes `.template-parity.json`, hashing each skeleton-owned file as it now stands, so the gate measures the app against the tag it stamped from. A departure that is permanent is a ratified entry in this repo's `variants.yaml`, one per app and key, and the manifest carries it; one that is temporary is a `.canonical-exceptions` line with an expiry and a tracker. An old exception reading "no desktop archetype exists" is deleted, not renewed.
4. **Adopt the new files.** Replace the app's version script and its flake's three kit hashes with `bump-version.sh` and `kitHash`; keep its own derivation parts (Thoth's CUDA, Bragi's mpv) in the app's `flake.nix`, which stays the app's.
5. **Prove it.** The app's own gates, then `copier update` to the next tag shows only intended changes.

Thoth is public and cannot call master's private pipeline, so its parity gate runs from the committed manifest alone (radar-hooves/master-project#460).
