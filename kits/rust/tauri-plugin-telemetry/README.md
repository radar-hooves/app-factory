# tauri-plugin-telemetry

A Tauri 2 app switches the household [`telemetry`](../telemetry) crate's whole contract on with one call, replacing what an app used to wire by hand (`full-stack-app-template#55`).

```toml
tauri-plugin-telemetry = { git = "https://github.com/radar-hooves/full-stack-app-template", tag = "v2026.10.1" }
```

## The one call

```rust
use std::sync::Mutex;

struct MyTelemetryStore { /* a handle to the app's own settings — SQLite, a config file */ }

impl tauri_plugin_telemetry::TelemetryStore for MyTelemetryStore {
    fn load(&self) -> Option<telemetry::Exporter> { /* read the app's own saved endpoint */ }
    fn save(&self, exporter: Option<telemetry::Exporter>) -> Result<(), String> { /* persist it */ }
}

fn main() {
    let store = MyTelemetryStore::new();
    tauri::Builder::default()
        .plugin(tauri_plugin_telemetry::init(
            "bragi",
            env!("CARGO_PKG_VERSION"),
            &["bragi::audit"], // the app's OWN extra allow-listed targets
            store,
        ))
        .setup(|app| {
            // After the app's own settings store is actually open — this
            // plugin's setup hook runs before the app's own, so it cannot
            // read a store that isn't open yet.
            let saved = /* re-read or clone the same store's */ None;
            tauri_plugin_telemetry::apply_saved(app.handle(), saved);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("build")
        .run(|_app, _event| {});
}
```

That call installs everything Thoth's `telemetry_settings.rs` and Bragi's `commands/telemetry.rs` + `command_span.rs` each wired by hand:

- `telemetry::init` runs in this plugin's own `setup` hook — which Tauri runs synchronously, on the same thread as `Builder::build`/`run`, before the event loop starts. Never inside a Tokio task, which `init` cannot tolerate (it builds a blocking `reqwest` client).
- The returned `Guard` is managed as `Mutex<Option<Guard>>` and taken and dropped in this plugin's own `on_event` hook on `RunEvent::Exit`, on the main thread — Tauri drops no managed state at exit, so this is the only thing that flushes the batch processors, and `Guard`'s own drop requires the main thread.
- [`sample_process_metrics`](../telemetry) is spawned once, in the same setup hook.
- Command spans carry a name, a duration (the span's own start/close timestamps) and an outcome, and nothing else — see [`traced`]/[`COMMAND_SPAN_TARGET`] in `src/span.rs`. **Not** Tauri's own `tracing` cargo feature: as of tauri 2.11–2.12, that feature's `ipc::request` span records the whole request body and its `ipc::request::response` span the whole response, at TRACE level — the opposite of "no argument capture by default." This crate never enables it.
- `telemetry_get`/`telemetry_set`/`telemetry_probe` are this plugin's own commands (see `src/commands.rs`), invoked from the frontend exactly as an app's own commands are: `invoke('plugin:telemetry|telemetry_get')`. The fleet environment wins and the pane shows it read-only (`TelemetryStatus.from_env`); the Settings pane's own contract is to call `telemetry_probe` **before** `telemetry_set`, so a bad address is tested before it is saved; `telemetry_set` runs `set_exporter` off the async runtime (`spawn_blocking`), since it runs the header helper on the calling thread.
- Each app still passes its own allow-list — `init`'s third argument — and this plugin adds its own command-span target to it automatically, so an app's `allow` only ever needs to name its OWN extra targets.

## Persistence stays each app's own

The plugin owns the LIVE exporter; persistence is whatever the app already has. Implement [`TelemetryStore`] over it:

```rust
pub trait TelemetryStore: Send + Sync + 'static {
    fn load(&self) -> Option<telemetry::Exporter>;
    fn save(&self, exporter: Option<telemetry::Exporter>) -> Result<(), String>;
}
```

A kit ships behaviour, never a storage schema an app must adopt.

## No request URL ever reaches an error or telemetry

`reqwest::Error`'s own `Display` embeds the full URL, and a query string can carry a signed token — this crate's `client.rs` and `probe.rs` already never build an error from one, and as of `telemetry` 0.6.0, `report_error_with_cause` scrubs a `reqwest`/`reqwest_middleware` error's URL out of its own chain wherever it appears, structurally: there is nothing left for a caller to remember.

## Why GTK is a build-time dependency of this crate on Linux

`tauri`'s own Cargo.toml declares `gtk` as an *unconditional* target dependency on Linux (not gated behind the `wry` Cargo feature this crate turns off with `default-features = false`), so anything depending on `tauri` at all needs GTK3 development headers to even `cargo check` on Linux — window or no window. `../flake.nix`'s devShell carries them; CI enters it with `nix develop`.

## Gates

`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test`, over the whole `kits/rust` workspace — one layer only, enforced in `.github/workflows/kit-rust.yaml`.
