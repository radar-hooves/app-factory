//! A Tauri 2 app switches the household `telemetry` crate's whole contract on
//! with one call:
//!
//! ```ignore
//! tauri::Builder::default()
//!     .plugin(tauri_plugin_telemetry::init(
//!         "bragi",
//!         env!("CARGO_PKG_VERSION"),
//!         &["bragi::audit"],
//!         MyTelemetryStore::new(),
//!     ))
//!     .setup(|app| {
//!         // After the app's own settings store is ready:
//!         tauri_plugin_telemetry::apply_saved(app.handle(), my_store.load());
//!         Ok(())
//!     })
//! ```
//!
//! That one `.plugin(...)` call replaces what an app used to wire by hand:
//! `telemetry::init` runs in this plugin's own `setup` hook, which Tauri runs
//! synchronously during `Builder::build`/`run`, on the same thread as the
//! call itself — never inside a Tokio task, which is the one thing `init`
//! cannot tolerate (it builds a blocking `reqwest` client). The returned
//! [`telemetry::Guard`] is managed as `Mutex<Option<Guard>>` and taken and
//! dropped in this plugin's own `on_event` hook on `RunEvent::Exit` — Tauri
//! drops no managed state at exit, so this is the only thing that flushes the
//! batch processors, and `on_event` runs on the main thread, satisfying
//! [`telemetry::Guard`]'s own drop requirement. [`sample_process_metrics`] is
//! spawned once, in the same setup hook. Command spans, with no argument
//! capture: see `span` — deliberately not Tauri's own `tracing` cargo
//! feature, which captures full command arguments and responses by default.
//! Settings-pane commands (`get`/`set`/`probe`): see `commands`.
//!
//! Persistence stays each app's own — implement [`TelemetryStore`] over
//! whatever the app already has (SQLite, a config file) and hand an instance
//! to [`init`].

mod commands;
mod span;

use std::sync::{Arc, Mutex};

use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{AppHandle, Manager, RunEvent, Runtime};

pub use commands::{Error, TelemetryProbeResult, TelemetryStatus};
pub use span::{
    COMMAND_SPAN_TARGET, traced, traced_sync, traced_sync_value, traced_with_span,
    traced_with_span_sync,
};
pub use telemetry::{Exporter, Guard, ProbeError};

/// What an app's Settings pane needs to read and write to persist a chosen
/// exporter across restarts. The plugin owns the LIVE pipeline; persistence
/// stays each app's own (SQLite for one app, a config file for another), so
/// this trait is the one seam between them — a kit ships behaviour, never a
/// storage schema an app must adopt.
pub trait TelemetryStore: Send + Sync + 'static {
    /// The endpoint and helper this app has saved, if any.
    fn load(&self) -> Option<Exporter>;
    /// Persist `exporter`, or clear the saved value on `None`.
    fn save(&self, exporter: Option<Exporter>) -> Result<(), String>;
}

/// Switch this crate's whole contract on for a Tauri 2 app.
///
/// `service_name` and `service_version` are `telemetry::init`'s own first two
/// arguments. `allow` is the app's OWN extra `tracing` targets — this
/// function adds [`COMMAND_SPAN_TARGET`] automatically, so `allow` never
/// needs to name it. `store` bridges the Settings-pane commands to the app's
/// own persisted settings.
///
/// Register with `.plugin(tauri_plugin_telemetry::init(...))` before
/// `.build()`/`.run()`. Call [`apply_saved`] separately, from the app's own
/// setup hook once its settings store is actually open — this plugin's own
/// setup hook runs before an app's, so it cannot read a store that is not
/// open yet.
pub fn init<R: Runtime>(
    service_name: &'static str,
    service_version: &'static str,
    allow: &'static [&'static str],
    store: impl TelemetryStore,
) -> TauriPlugin<R> {
    let mut combined_allow = Vec::with_capacity(allow.len() + 1);
    combined_allow.push(COMMAND_SPAN_TARGET);
    combined_allow.extend_from_slice(allow);
    let combined_allow: &'static [&'static str] = Vec::leak(combined_allow);
    let store: Arc<dyn TelemetryStore> = Arc::new(store);

    PluginBuilder::new("telemetry")
        .invoke_handler(tauri::generate_handler![
            commands::telemetry_get,
            commands::telemetry_set,
            commands::telemetry_probe,
        ])
        .setup(move |app, _api| {
            let guard = telemetry::init(service_name, service_version, combined_allow);
            app.manage(Mutex::new(Some(guard)));
            app.manage(store);
            // "Is it a memory hog" read from real use, not a guess: RSS and
            // CPU every 60s, on the crate's own force-allowed
            // `telemetry::process` target. The crate spawns nothing itself,
            // so this is the one place this plugin puts the sampler on the
            // app's runtime; it never returns.
            tauri::async_runtime::spawn(telemetry::sample_process_metrics());
            Ok(())
        })
        .on_event(|app, event| {
            if let RunEvent::Exit = event {
                // Tauri drops no managed state at exit; this arm is what
                // actually flushes the batch processors, on the main thread —
                // the only thread `Guard`'s own `Drop` may run on.
                if let Some(state) = app.try_state::<Mutex<Option<Guard>>>() {
                    let guard = state.lock().unwrap_or_else(|e| e.into_inner()).take();
                    drop(guard);
                }
            }
        })
        .build()
}

/// Point the live exporter at `saved`, unless the environment already set
/// one. Call once, from the app's own setup hook, after its settings store is
/// open — a Dock-launched app inherits no fleet environment, so this is the
/// only door on a machine the fleet does not configure. Where the environment
/// did set one, this is a no-op and it wins.
///
/// Runs on a thread of its own: `saved` is only `Some` where the app's own
/// config held a non-empty endpoint, and applying it blocks on the header
/// helper (up to ten seconds), which must never delay the app's own startup.
pub fn apply_saved<R: Runtime>(app: &AppHandle<R>, saved: Option<Exporter>) {
    let Some(wanted) = saved else {
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        let Some(state) = app.try_state::<Mutex<Option<Guard>>>() else {
            return;
        };
        let guard = state.lock().unwrap_or_else(|e| e.into_inner());
        let Some(guard) = guard.as_ref() else {
            return;
        };
        if guard.exporter_is_from_env() {
            return;
        }
        guard.set_exporter(Some(wanted));
    });
}
