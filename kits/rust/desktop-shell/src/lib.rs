//! The shell every household Tauri app has around its own domain code: the
//! macOS traffic lights centred in the app's header, and a tray that can never
//! take the app down. An app calls each where its own setup wants it.

pub mod traffic_lights;

/// The `tracing` target a tray fault is reported on. `tauri-plugin-telemetry`
/// puts it on the allow-list itself, so the fault reaches the household's log
/// store and not only the machine's own stderr.
pub const TRAY_TARGET: &str = "desktop_shell::tray";

/// Runs `setup`, which builds the app's tray icon, and carries on without a
/// tray if it fails. On Linux `tray-icon`'s libappindicator binding panics,
/// rather than returning an error, when neither libayatana-appindicator3 nor
/// libappindicator3 is installed: the `.deb` depends on one of them, but an
/// AppImage or a bare binary does not, and uncaught the panic kills the app
/// before its first window shows. Returns whether the tray is up.
pub fn guard_tray<E: std::fmt::Display>(setup: impl FnOnce() -> Result<(), E>) -> bool {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(setup)) {
        Ok(Ok(())) => true,
        Ok(Err(e)) => {
            tracing::error!(target: TRAY_TARGET, "tray setup failed, continuing without a tray: {e}");
            false
        }
        Err(payload) => {
            let detail = payload
                .downcast_ref::<&str>()
                .map(|s| (*s).to_string())
                .or_else(|| payload.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown panic".to_string());
            tracing::error!(
                target: TRAY_TARGET,
                "tray setup panicked (no libayatana-appindicator3 or libappindicator3?), \
                 continuing without a tray: {detail}"
            );
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{TRAY_TARGET, guard_tray};
    use std::sync::{Arc, Mutex};
    use tracing_subscriber::layer::SubscriberExt;

    struct Targets(Arc<Mutex<Vec<(String, String)>>>);

    impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for Targets {
        fn on_event(
            &self,
            event: &tracing::Event<'_>,
            _: tracing_subscriber::layer::Context<'_, S>,
        ) {
            struct Message(String);
            impl tracing::field::Visit for Message {
                fn record_debug(&mut self, f: &tracing::field::Field, v: &dyn std::fmt::Debug) {
                    if f.name() == "message" {
                        self.0 = format!("{v:?}");
                    }
                }
            }
            let mut message = Message(String::new());
            event.record(&mut message);
            self.0
                .lock()
                .unwrap()
                .push((event.metadata().target().to_string(), message.0));
        }
    }

    fn events_of(f: impl FnOnce()) -> Vec<(String, String)> {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let dispatch =
            tracing::Dispatch::new(tracing_subscriber::registry().with(Targets(seen.clone())));
        tracing::dispatcher::with_default(&dispatch, f);
        seen.lock().unwrap().clone()
    }

    #[test]
    fn a_tray_fault_is_reported_on_the_target_telemetry_allows() {
        let events = events_of(|| {
            guard_tray(|| Err::<(), _>("bare modifier accelerator"));
            guard_tray(|| -> Result<(), String> { panic!("no appindicator") });
        });
        assert_eq!(events.len(), 2, "{events:?}");
        assert!(events.iter().all(|(t, _)| t == TRAY_TARGET), "{events:?}");
        assert!(
            events[0].1.contains("bare modifier accelerator"),
            "{events:?}"
        );
        assert!(events[1].1.contains("no appindicator"), "{events:?}");
    }

    #[test]
    fn a_tray_that_sets_up_is_up() {
        assert!(guard_tray(|| Ok::<(), String>(())));
    }

    #[test]
    fn a_tray_that_errs_is_down_and_the_app_carries_on() {
        assert!(!guard_tray(|| Err::<(), _>("no tray")));
    }

    #[test]
    fn a_tray_that_panics_is_down_and_the_app_carries_on() {
        assert!(!guard_tray(|| -> Result<(), String> {
            panic!("Failed to load ayatana-appindicator3 or appindicator3 dynamic library")
        }));
    }
}
