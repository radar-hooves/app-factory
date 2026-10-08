# Desktop skeleton

Thoth and Bragi stamp from one source, `skeletons/desktop/`, and take their shared code as kits (app-factory#1, rulings 1 and 2; built on the operator's ruling of 01/10/2026). A change made once here reaches both on their next converge.

## Layout

```text
copier.yaml                 one config; `skeleton` picks the tree (default web)
template/                   the web skeleton, where master's parity, converge and fleet tools read it
skeletons/desktop/          the desktop skeleton; a symlink into template/ where web and desktop share a file
kits/rust/desktop-shell     traffic lights and the tray guard
.github/workflows/desktop-ci.yaml   the desktop CI, called by each app @main
```

Copier reads a git source's config from its root alone, so both skeletons answer one `copier.yaml`, and `_subdirectory` is rendered from the `skeleton` answer. A web app's answers file predates the question, takes the default, and renders byte-identical to before (proven against casefile's answers: 212 files identical, the answers file gains `skeleton: web`). `template/` becomes `skeletons/web/` in one move once master's canonical-app-migration tools read the path from `_subdirectory` instead of hard-coding `template/`.

A symlink copier follows is how the two skeletons share a source: the drift and craft lints, the stylelint and TypeScript configs, `app.html`, the test harness. The design-craft lint is the one shared file that differs by skeleton: a desktop app has no phone width.

## What lives where

| | Kit (versioned, pinned per app) | Skeleton-owned (stamped, converged) | App-owned (first stamp, then the app's) |
| --- | --- | --- | --- |
| Rust shell | `desktop-shell`: `traffic_lights::setup`, `guard_tray`; `telemetry` and `tauri-plugin-telemetry` | `src-tauri/src/main.rs` | `lib.rs` and every module; `Cargo.toml`; `build.rs` |
| Tauri config | | | `tauri.conf.json` (windows, CSP, bundle, updater key), `capabilities/` |
| Frontend shell | `@poodle64/ui`, `@poodle64/design-tokens` | `svelte.config.js`, `vite.config.ts` (port from answers), `vitest.config.ts`, `tsconfig.json`, `components.json`, `.npmrc`, `src/app.html`, `src/routes/+layout.ts`, `src/lib/utils.ts`, `src/test/setup.ts` | `package.json`, `src/app.css` (palette), routes and components |
| Settings pane | the telemetry section: next, into `@poodle64/ui` once `@poodle64/ui/settings` lands | | the pane's other sections |
| CI | `desktop-ci.yaml`: fmt, clippy, tests on atlas and huginn in the app's devShell; the frontend gates on atlas; `flake.nix`'s `pnpmDeps` hash corrected on a pull request's branch, where the flake packages pnpm dependencies | `.github/workflows/ci.yaml` (the caller, granting that one job its write), `security.yaml`, `scripts/update-pnpm-deps-hash.sh` | a workflow of its own for checks only it needs |
| macOS signing | | `scripts/cargo-codesign.sh`: build, sign, verify; explicit local ad-hoc mode; releases/configured signing fail closed; execute the signed dev binary | `tauri.conf.json`: runner and local `signingIdentity: "-"`; build host declares `APPLE_SIGNING_IDENTITY` for both signers; `flake.nix`: `jq` |
| Release and updater | not built; see below | | `release.yaml`, the updater wiring |
| Lints and formatters | | `stylelint.config.js`, the drift and craft lints, `.pre-commit-config.yaml` | the lints' baselines |
| Repo | | `.gitignore`, `.gitattributes`, `.envrc`, `renovate.json`, `.vscode/extensions.json` | `flake.nix`, `README.md`, `CHANGELOG.md`, `docs/`, `.claude/` |

The owned set is what the skeleton renders minus copier's `_skip_if_exists`. An app customises by mounting (calling a kit where its own setup wants it), configuring (its answers: `frontend_port`, `bundle_identifier`, `linux_cargo_args`, `dark_first`) and adding (its own modules, routes, workflows, and a `.gitignore` inside any directory only it has).

## Signing verification — 08/10/2026

The signing runner's 22 contract tests pass, including the single host-declared `APPLE_SIGNING_IDENTITY` fingerprint, certificate-free local builds, fail-closed release/custom profiles, both Mac target artefact paths, effective Tauri configuration, controlled parse errors and Linux's no-op bundle preflight. The public tree pins no certificate; Tauri CLI 2.11.4 reads the same environment declaration for final bundle signing. A real Tauri release-bundle invocation with effective ad-hoc identity failed in the preflight with the intended policy refusal, before signing. A native Cargo fixture confirmed that neither `CARGO_PROFILE=release` nor a `build` alias selects release; CLI profile flags do. The factory self-test's full Python kit suites, rendered backend and frontend gates passed with CI's installs. A committed skeleton compiled on huginn using Bragi's existing lockfile inputs; fresh input downloads were blocked by Nix cache transport failures.

Huginn's existing `poodle64` identity (`104B085265F9E2BBE7BBFA15C289B55363E529E0`) has a software private key in `~/Library/Keychains/login.keychain-db`, not a PIV/signet key. Native Security queries found that keychain locked in SSH's security session and unlocked in the GUI login session. A temporary GUI launchd proof signed the compiled skeleton without unlocking a keychain or changing credentials, ACLs or trust. `codesign --verify --strict --verbose=2` returned **valid on disk** and **satisfies its Designated Requirement**; the requirement binds `com.example.signingproof` to that certificate leaf. The proof job was removed.

Yggdrasil's declared runner now uses a GUI user agent and the real user HOME for identity discovery, with explicit isolated Cargo/XDG data homes. GUI context alone was insufficient: the first runner attempt found no identity under its private HOME. [The second real huginn runner attempt](https://github.com/radar-hooves/app-factory/actions/runs/37732878586/attempts/2) passed on 08/10/2026: two changed Rust binaries through the actual factory Cargo runner, two strict verifications returning **valid on disk** and **satisfies its Designated Requirement**, different binary hashes and identical certificate-leaf designated requirements. The factory self-test's opt-in `macos-signing-identity` dispatch input retains that proof. Desktop CI on main honours the declared Cargo home rather than overriding it. A full `.app` build also remains unproved: the scratch install resolved JavaScript Tauri API 2.12.1 against native Tauri 2.11.6, and the CLI rejected that mismatch before signing. Privacy-grant survival still needs the apps' signed in-place-update drive test.

The proposed shared desktop layer is `desktop-layer.md`; no app adoption is included here.

## Not built, and why

- **Release and the updater.** The two pipelines disagree on the one thing that matters: Thoth builds on GitHub's runners with apt and ships a Linux AppImage that self-updates; Bragi builds on huginn and atlas inside its flake, where linuxdeploy cannot bundle an AppImage, and has no updater. One reusable release workflow means choosing one, and Bragi's updater needs a signing key the operator mints.
- **The telemetry settings section.** Both apps render the plugin's `get`/`set`/`probe` in different components. It belongs beside the settings page `@poodle64/ui/settings` is becoming, which another lane is building now.
- **A Nix kit.** Both flakes share a shape (a rust-overlay toolchain, `buildRustPackage` over `src-tauri`, `fetchPnpmDeps`) but little text; Thoth's carries CUDA, Bragi's mpv. A first stamp gets a devShell only.
