# kits/rust

Shared Rust app code, versioned and consumed as a Cargo git dependency — never copied into an app. The skeleton this repo's `template/` stamps stays thin; a kit is born when a second app in a language needs the same code.

## Crates

- [`telemetry`](telemetry) — the household's one Rust telemetry call (moved here from the standalone `telemetry-rs` repo, with its history).
- [`tauri-plugin-telemetry`](tauri-plugin-telemetry) — the Tauri 2 plugin wiring it in with one `.plugin(...)` call.
- [`desktop-shell`](desktop-shell): the shell around a desktop app's own code: `traffic_lights::setup` gives the window an empty unified toolbar so AppKit centres the macOS window buttons in a 52-point header, and `guard_tray` keeps a failed or panicking tray from taking the app down. Each app calls them from its own setup; the desktop skeleton (`skeletons/desktop/`) stamps the dependency.

## Depending on a kit

```toml
[dependencies]
telemetry = { git = "https://github.com/radar-hooves/app-factory", tag = "v2026.10.37" }
tauri-plugin-telemetry = { git = "https://github.com/radar-hooves/app-factory", tag = "v2026.10.37" }
```

No `path` key: Cargo traverses a git repository's whole file tree looking for the named crate's `Cargo.toml`, so a uniquely-named crate resolves regardless of where in the tree it lives. Pin `tag` to whatever release tag the change you need landed in — this repo's own calendar tags (`vYYYY.M.x`), never a crate-internal version.

**A Nix-built app must also refresh its own `flake.nix`.** Thoth and Bragi build via `rustPlatform.buildRustPackage` with `cargoLock.lockFile = ./src-tauri/Cargo.lock` and a per-git-dependency `outputHashes` entry keyed `"<crate-name>-<version>"`, e.g. `"telemetry-0.6.0" = "sha256-...";`. A crate's version bump changes its key, and an app that only edits `Cargo.toml`'s `tag =` and forgets `outputHashes` fails Nix's fixed-output check. Each kit crate consumed needs its own entry (`desktop-shell`, `telemetry`, `tauri-plugin-telemetry`). After editing `Cargo.toml` and running `cargo update -p <crate>` in the consuming app: set the entry's value to `pkgs.lib.fakeHash`, run `nix build`, and paste back the hash Nix reports.

## Building this workspace

`cargo fmt`/`clippy`/`test` need a Rust toolchain, and on Linux, GTK3 + WebKitGTK development headers — `tauri`'s own Cargo.toml makes `gtk` an unconditional Linux dependency, not something `tauri-plugin-telemetry`'s `default-features = false` can turn off. `flake.nix` carries both:

```console
$ nix develop
$ cargo test
```

CI (`.github/workflows/kit-rust.yaml`, `.github/workflows/security.yaml`) enters the same devShell.

## What `copier copy` never touches

`kit/` is not part of `template/`. A `copier copy` of this repo stamps only the skeleton; nothing here reaches a scaffolded app except through the dependency line above.
