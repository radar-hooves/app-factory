# kit/rust

Shared Rust app code, versioned and consumed as a Cargo git dependency — never copied into an app (`full-stack-app-template#55`). The skeleton this repo's `template/` stamps stays thin; a kit is born when a second app in a language needs the same code.

## Crates

- [`telemetry`](telemetry) — the household's one Rust telemetry call (moved here from the standalone `telemetry-rs` repo, with its history).
- [`tauri-plugin-telemetry`](tauri-plugin-telemetry) — the Tauri 2 plugin wiring it in with one `.plugin(...)` call.

## Depending on a kit

```toml
[dependencies]
telemetry = { git = "https://github.com/radar-hooves/full-stack-app-template", tag = "v2026.10.1" }
tauri-plugin-telemetry = { git = "https://github.com/radar-hooves/full-stack-app-template", tag = "v2026.10.1" }
```

No `path` key: Cargo traverses a git repository's whole file tree looking for the named crate's `Cargo.toml`, so a uniquely-named crate resolves regardless of where in the tree it lives. Pin `tag` to whatever release tag the change you need landed in — this repo's own calendar tags (`vYYYY.M.D`), never a crate-internal version.

**A Nix-built app must also refresh its own `flake.nix`.** Both Thoth and Bragi build via `rustPlatform.buildRustPackage` with `cargoLock.lockFile = ./src-tauri/Cargo.lock` and a per-git-dependency `outputHashes` entry, keyed `"<crate-name>-<version>"` — Thoth's today reads `"telemetry-0.4.0" = "sha256-...";`. Two things move that key out from under it here: the git URL changes (`telemetry-rs` → `full-stack-app-template`) and this lane bumped the crate's own version (0.5.0 → 0.6.0), so the key becomes `"telemetry-0.6.0"` and needs a fresh hash regardless — an app that only edits `Cargo.toml`'s `git =`/`tag =` and forgets `outputHashes` fails Nix's fixed-output check rather than silently building the old source (this already happened to Thoth on an earlier telemetry tag bump). A new consumer of `tauri-plugin-telemetry` needs its own `"tauri-plugin-telemetry-0.1.0"` entry alongside. After editing `Cargo.toml`, running `cargo update -p telemetry -p tauri-plugin-telemetry` in the consuming app, and updating the `outputHashes` key name: set that entry's value to `pkgs.lib.fakeHash`, run `nix build`, and paste back the hash Nix reports the mismatch as.

## Building this workspace

`cargo fmt`/`clippy`/`test` need a Rust toolchain, and on Linux, GTK3 + WebKitGTK development headers — `tauri`'s own Cargo.toml makes `gtk` an unconditional Linux dependency, not something `tauri-plugin-telemetry`'s `default-features = false` can turn off. `flake.nix` carries both:

```console
$ nix develop
$ cargo test
```

CI (`.github/workflows/kit-rust.yaml`, `.github/workflows/security.yaml`) enters the same devShell.

## What `copier copy` never touches

`kit/` is not part of `template/`. A `copier copy` of this repo stamps only the skeleton; nothing here reaches a scaffolded app except through the dependency line above.
