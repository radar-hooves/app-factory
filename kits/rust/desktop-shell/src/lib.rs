//! The shell every household Tauri app has around its own domain code: the
//! macOS traffic lights centred in the app's header, and a tray that can never
//! take the app down. An app calls each where its own setup wants it.

pub mod traffic_lights;

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
            tracing::error!("tray setup failed, continuing without a tray: {e}");
            false
        }
        Err(payload) => {
            let detail = payload
                .downcast_ref::<&str>()
                .map(|s| (*s).to_string())
                .or_else(|| payload.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown panic".to_string());
            tracing::error!(
                "tray setup panicked (no libayatana-appindicator3 or libappindicator3?), \
                 continuing without a tray: {detail}"
            );
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::guard_tray;

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
