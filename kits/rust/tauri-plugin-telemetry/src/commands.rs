//! The Settings-pane commands: where this device sends its telemetry.
//!
//! A Dock-launched app inherits no fleet environment, so on a machine the
//! fleet does not configure the pane is the only door. Where
//! `OTEL_EXPORTER_OTLP_ENDPOINT` is set the environment wins:
//! `Guard::set_exporter` is a no-op there, and [`TelemetryStatus::from_env`]
//! tells the pane to show the fields read-only.
//!
//! Persistence is each app's own — a SQLite row, a config file, whatever it
//! already has — reached through the [`crate::TelemetryStore`] the app hands
//! `init`. These commands only read and write the LIVE exporter and the
//! store; the crate itself still reads and writes no settings file of its
//! own, and no header value, the helper's stdout, or anything derived from
//! either is returned, logged or stored — only the helper command string.

use std::sync::{Arc, Mutex};

use serde::{Serialize, Serializer};
use tauri::{AppHandle, Manager, Runtime, State};

use crate::TelemetryStore;
use crate::span::traced;

/// A command's own error, distinct from the crate's `ProbeError`: nothing
/// here is a transport failure, so plain text is the whole shape
/// (`rules-library/stacks/tauri.md` — never a bare `Result<T, String>`).
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The app's own settings store refused to save.
    #[error("{0}")]
    Store(String),
    /// The blocking task this command spawned could not be joined.
    #[error("the command did not complete: {0}")]
    Task(String),
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// The configured exporter, startup state and saved values, for the pane.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryStatus {
    /// The configured endpoint. A value does not prove the exporter started.
    pub endpoint: String,
    /// Installed log/span providers, not proof of collector reachability.
    pub started: bool,
    /// The configured header helper. Empty means no helper.
    pub headers_helper: String,
    /// The fleet's environment set the exporter, so it cannot be changed here.
    pub from_env: bool,
    /// The endpoint saved on this machine — what the fields edit.
    pub saved_endpoint: String,
    /// The helper command saved on this machine.
    pub saved_headers_helper: String,
}

/// A probe's outcome: accepted, or the class that stopped it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryProbeResult {
    /// The collector accepted a single test log record.
    pub ok: bool,
    /// Why it did not, as a transport class or an HTTP status. Empty on
    /// success. Never a URL, a header value or a response body.
    pub message: String,
}

/// An `Exporter` from a pair of raw field values, or `None` when export is
/// off — an empty endpoint is no exporter, and an empty helper is no helper.
fn exporter_of(endpoint: &str, headers_helper: &str) -> Option<telemetry::Exporter> {
    let endpoint = endpoint.trim();
    if endpoint.is_empty() {
        return None;
    }
    let helper = headers_helper.trim();
    Some(telemetry::Exporter {
        endpoint: endpoint.to_owned(),
        headers_helper: (!helper.is_empty()).then(|| helper.to_owned()),
    })
}

/// Run `f` against the process's `Guard`, or `None` where telemetry was never
/// installed (a unit test, or a second `init`).
fn with_guard<R: Runtime, T>(
    app: &AppHandle<R>,
    f: impl FnOnce(&telemetry::Guard) -> T,
) -> Option<T> {
    let state = app.try_state::<Mutex<Option<telemetry::Guard>>>()?;
    let guard = state.lock().unwrap_or_else(|e| e.into_inner());
    guard.as_ref().map(f)
}

/// What the pane shows, assembled from the live guard and the app's own store.
fn status<R: Runtime>(app: &AppHandle<R>, store: &Arc<dyn TelemetryStore>) -> TelemetryStatus {
    let saved = store.load();
    let (in_force, started, from_env) = with_guard(app, |g| {
        let (exporter, started) = g.exporter_status();
        (exporter, started, g.exporter_is_from_env())
    })
    .unwrap_or((None, false, false));
    TelemetryStatus {
        endpoint: in_force
            .as_ref()
            .map(|e| e.endpoint.clone())
            .unwrap_or_default(),
        headers_helper: in_force.and_then(|e| e.headers_helper).unwrap_or_default(),
        started,
        from_env,
        saved_endpoint: saved
            .as_ref()
            .map(|e| e.endpoint.clone())
            .unwrap_or_default(),
        saved_headers_helper: saved.and_then(|e| e.headers_helper).unwrap_or_default(),
    }
}

/// Report the live exporter and the app's saved values.
#[tauri::command]
pub(crate) async fn telemetry_get<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, Arc<dyn TelemetryStore>>,
) -> Result<TelemetryStatus, Error> {
    let store = store.inner().clone();
    traced("telemetry_get", async move { Ok(status(&app, &store)) }).await
}

/// Save this machine's collector via the app's own store, then repoint the
/// live exporter at it. A no-op on the pipeline where the environment set the
/// exporter — the values are still saved, so clearing the environment later
/// brings them back.
///
/// `set_exporter` runs the header helper on the caller's thread, so it runs
/// off the async runtime here (`spawn_blocking`), never inline on a Tokio
/// worker.
#[tauri::command]
pub(crate) async fn telemetry_set<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, Arc<dyn TelemetryStore>>,
    endpoint: String,
    headers_helper: String,
) -> Result<TelemetryStatus, Error> {
    let store = store.inner().clone();
    traced("telemetry_set", async move {
        let endpoint = endpoint.trim().to_owned();
        let headers_helper = headers_helper.trim().to_owned();
        let wanted = exporter_of(&endpoint, &headers_helper);
        store.save(wanted.clone()).map_err(Error::Store)?;

        let handle = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            with_guard(&handle, |guard| guard.set_exporter(wanted));
        })
        .await
        .map_err(|e| Error::Task(e.to_string()))?;

        Ok(status(&app, &store))
    })
    .await
}

/// Send one log record to the values being edited and report whether they
/// were accepted, without saving anything — the Settings pane's own contract
/// is to call this BEFORE `telemetry_set`, so a bad address is never saved.
///
/// Blocks until the collector answers or the OTLP timeout expires, so this
/// runs off the async runtime too.
#[tauri::command]
pub(crate) async fn telemetry_probe(
    endpoint: String,
    headers_helper: String,
) -> Result<TelemetryProbeResult, Error> {
    traced("telemetry_probe", async move {
        let Some(wanted) = exporter_of(&endpoint, &headers_helper) else {
            return Ok(TelemetryProbeResult {
                ok: false,
                message: "no collector address to test".to_owned(),
            });
        };
        let outcome = tauri::async_runtime::spawn_blocking(move || telemetry::probe(&wanted))
            .await
            .map_err(|e| Error::Task(e.to_string()))?;
        Ok(match outcome {
            Ok(()) => TelemetryProbeResult {
                ok: true,
                message: String::new(),
            },
            Err(why) => TelemetryProbeResult {
                ok: false,
                message: why.to_string(),
            },
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_endpoint_is_no_exporter() {
        assert!(exporter_of("", "header-helper").is_none());
        assert!(exporter_of("   ", "").is_none());
    }

    #[test]
    fn an_empty_helper_is_no_helper() {
        let e = exporter_of(" https://otlp.example ", "  ").unwrap();
        assert_eq!(e.endpoint, "https://otlp.example");
        assert!(e.headers_helper.is_none());
    }

    #[test]
    fn the_helper_command_is_carried_verbatim() {
        let e = exporter_of("https://otlp.example", " header-helper ").unwrap();
        assert_eq!(e.headers_helper.as_deref(), Some("header-helper"));
    }

    #[test]
    fn error_serialises_as_its_display_string_never_a_struct() {
        let err = Error::Store("disk is full".to_owned());
        let json = serde_json::to_string(&err).expect("serialises");
        assert_eq!(json, "\"disk is full\"");
    }
}
