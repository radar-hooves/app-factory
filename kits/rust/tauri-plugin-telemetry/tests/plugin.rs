//! Proves `init` actually wires the plugin into a real (mocked) Tauri app:
//! the unit tests in `src/` cover the logic each piece is built from, but
//! only a real `App` proves the plugin registers, manages its state, and
//! exposes its commands under the right names — none of which a plain
//! function call can exercise.

use std::sync::{Arc, Mutex};

use tauri::Manager;
use tauri_plugin_telemetry::TelemetryStore;

#[derive(Default)]
struct MemoryStore(Mutex<Option<telemetry::Exporter>>);

impl TelemetryStore for MemoryStore {
    fn load(&self) -> Option<telemetry::Exporter> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn save(&self, exporter: Option<telemetry::Exporter>) -> Result<(), String> {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = exporter;
        Ok(())
    }
}

fn build_app() -> tauri::App<tauri::test::MockRuntime> {
    tauri::test::mock_builder()
        .plugin(tauri_plugin_telemetry::init(
            "test-app",
            "0.0.0",
            &["test_app::commands"],
            MemoryStore::default(),
        ))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("the plugin's setup hook must not fail")
}

#[test]
fn init_manages_the_guard_and_the_store() {
    let app = build_app();

    assert!(
        app.try_state::<Mutex<Option<telemetry::Guard>>>().is_some(),
        "init's Guard must be managed under Mutex<Option<Guard>> — the shape \
         RunEvent::Exit takes it back out of"
    );
    assert!(
        app.try_state::<Arc<dyn TelemetryStore>>().is_some(),
        "the app's own TelemetryStore must be managed for the Settings-pane \
         commands to reach"
    );
}

#[test]
fn a_second_app_from_the_same_process_still_builds() {
    // telemetry::init is a once-per-process claim (INITIALISED), so a second
    // plugin registration in the same test binary must still succeed and
    // manage an (empty) Guard, exactly as a second `telemetry::init` call
    // does on its own — this plugin must not surface that as a setup failure.
    let _first = build_app();
    let second = build_app();
    assert!(
        second
            .try_state::<Mutex<Option<telemetry::Guard>>>()
            .is_some()
    );
}
