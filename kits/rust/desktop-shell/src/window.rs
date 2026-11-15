//! The main window, managed once: one running instance, a window that hides
//! instead of closing, comes back from the Dock or a second launch, can start
//! minimised, and is never restored onto a display that is gone.
//!
//! ```ignore
//! let builder = desktop_shell::window::plugins(tauri::Builder::default(), "main");
//! builder
//!     .setup(|app| {
//!         desktop_shell::window::setup(app.handle(), "main", start_minimised, (520, 400));
//!         Ok(())
//!     })
//!     .build(tauri::generate_context!())?
//!     .run(|app, event| desktop_shell::window::on_run_event(app, "main", &event));
//! ```
//!
//! Position and size are the official `tauri-plugin-window-state`'s: this
//! module registers it, never a second owner. It excludes `VISIBLE`, so a
//! window hidden on close is not restored hidden over `start_minimised`.

use tauri::{
    AppHandle, Builder, Manager, PhysicalPosition, PhysicalSize, RunEvent, Runtime, WebviewWindow,
    WindowEvent,
};
use tauri_plugin_window_state::StateFlags;

/// Registers single-instance (a second launch shows and focuses `label`'s
/// window, then exits) and window-state (everything but visibility, for every
/// window). Register it first: single-instance must run before anything else
/// starts.
pub fn plugins<R: Runtime>(builder: Builder<R>, label: &'static str) -> Builder<R> {
    plugins_with(builder, move |app| show(app, label), |_| true)
}

/// [`plugins`], with the window a second launch raises chosen by `raise`, and
/// window-state saving and restoring only the windows `tracked` accepts by
/// label (an app with auxiliary windows tracks its managed one alone).
pub fn plugins_with<R: Runtime>(
    builder: Builder<R>,
    raise: impl Fn(&AppHandle<R>) + Send + Sync + 'static,
    tracked: impl Fn(&str) -> bool + Send + Sync + 'static,
) -> Builder<R> {
    builder
        .plugin(tauri_plugin_single_instance::init(
            move |app, _argv, _cwd| raise(app),
        ))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all().difference(StateFlags::VISIBLE))
                .with_filter(tracked)
                .build(),
        )
}

/// From the app's `setup`, once the window-state plugin has restored the
/// window: puts it back on a display that exists (shrunk to fit, never below
/// `min`), makes closing it hide it, and hides it for a minimised start. A
/// missing window is a no-op.
pub fn setup<R: Runtime>(
    app: &AppHandle<R>,
    label: &'static str,
    start_minimised: bool,
    min: (u32, u32),
) {
    setup_with(app, label, start_minimised, min, |_| true);
}

/// [`setup`], with each close request put to `hide_on_close`: `true` hides the
/// window, `false` lets the close proceed.
pub fn setup_with<R: Runtime>(
    app: &AppHandle<R>,
    label: &'static str,
    start_minimised: bool,
    min: (u32, u32),
    hide_on_close: impl Fn(&WebviewWindow<R>) -> bool + Send + 'static,
) {
    let Some(window) = app.get_webview_window(label) else {
        return;
    };
    fit_to_displays(&window, min);
    let closing = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event
            && hide_on_close(&closing)
        {
            api.prevent_close();
            let _ = closing.hide();
        }
    });
    if start_minimised {
        let _ = window.hide();
    }
}

/// Shows, unminimises and focuses the window; the tray's "Show" and a second
/// launch call it.
pub fn show<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// From `App::run`'s callback: a Dock click with no visible window brings the
/// window back (AppKit does not, for a window that was hidden).
pub fn on_run_event<R: Runtime>(app: &AppHandle<R>, label: &str, event: &RunEvent) {
    on_run_event_with(app, event, |app| show(app, label));
}

/// [`on_run_event`], raising whatever `raise` chooses.
pub fn on_run_event_with<R: Runtime>(
    app: &AppHandle<R>,
    event: &RunEvent,
    raise: impl Fn(&AppHandle<R>),
) {
    #[cfg(target_os = "macos")]
    if let RunEvent::Reopen {
        has_visible_windows: false,
        ..
    } = event
    {
        raise(app);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, event, raise);
}

fn fit_to_displays<R: Runtime>(window: &WebviewWindow<R>, min: (u32, u32)) {
    let (Ok(monitors), Ok(position), Ok(size)) = (
        window.available_monitors(),
        window.outer_position(),
        window.inner_size(),
    ) else {
        return;
    };
    let monitors: Vec<Rect> = monitors
        .iter()
        .map(|m| {
            Rect::new(
                m.position().x,
                m.position().y,
                m.size().width,
                m.size().height,
            )
        })
        .collect();
    let current = Rect::new(position.x, position.y, size.width, size.height);
    let fitted = fit(current, &monitors, min);
    if fitted != current {
        tracing::info!(
            "window {:?} did not fit the displays, moved to {:?}",
            current,
            fitted
        );
        let _ = window.set_size(PhysicalSize::new(fitted.width(), fitted.height()));
        let _ = window.set_position(PhysicalPosition::new(fitted.left as i32, fitted.top as i32));
    }
}

/// A rectangle in physical pixels, `i64` so an `i32` origin plus a `u32` extent
/// cannot overflow.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Rect {
    left: i64,
    top: i64,
    right: i64,
    bottom: i64,
}

impl Rect {
    fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Rect {
            left: x.into(),
            top: y.into(),
            right: i64::from(x) + i64::from(width),
            bottom: i64::from(y) + i64::from(height),
        }
    }

    fn width(&self) -> u32 {
        (self.right - self.left) as u32
    }

    fn height(&self) -> u32 {
        (self.bottom - self.top) as u32
    }

    fn overlap(&self, o: &Rect) -> Option<Rect> {
        let r = Rect {
            left: self.left.max(o.left),
            top: self.top.max(o.top),
            right: self.right.min(o.right),
            bottom: self.bottom.min(o.bottom),
        };
        (r.left < r.right && r.top < r.bottom).then_some(r)
    }

    fn area(&self) -> i64 {
        (self.right - self.left) * (self.bottom - self.top)
    }

    /// What of `self` is left once `o` is taken away: up to four rectangles.
    fn minus(&self, o: &Rect) -> Vec<Rect> {
        let Some(i) = self.overlap(o) else {
            return vec![*self];
        };
        [
            Rect {
                bottom: i.top,
                ..*self
            },
            Rect {
                top: i.bottom,
                ..*self
            },
            Rect {
                right: i.left,
                top: i.top,
                bottom: i.bottom,
                ..*self
            },
            Rect {
                left: i.right,
                top: i.top,
                bottom: i.bottom,
                ..*self
            },
        ]
        .into_iter()
        .filter(|r| r.left < r.right && r.top < r.bottom)
        .collect()
    }
}

/// `frame` unchanged when it lies wholly within the union of `monitors` (a
/// window straddling two is fine). Otherwise it is shrunk to the monitor it
/// overlaps most (the first, the primary, if none) and pulled inside it.
/// `tauri-plugin-window-state` skips the position of a window whose display is
/// gone but still applies its saved size, so an origin on screen proves
/// nothing: the whole frame is checked.
fn fit(frame: Rect, monitors: &[Rect], min: (u32, u32)) -> Rect {
    let Some(primary) = monitors.first() else {
        return frame;
    };
    let uncovered = monitors.iter().fold(vec![frame], |left, m| {
        left.iter().flat_map(|r| r.minus(m)).collect()
    });
    if uncovered.is_empty() {
        return frame;
    }
    let target = monitors
        .iter()
        .filter_map(|m| Some((m, frame.overlap(m)?.area())))
        .max_by_key(|&(_, area)| area)
        .map_or(primary, |(m, _)| m);
    let width = frame
        .width()
        .clamp(min.0.min(target.width()), target.width());
    let height = frame
        .height()
        .clamp(min.1.min(target.height()), target.height());
    let left = frame
        .left
        .clamp(target.left, target.right - i64::from(width));
    let top = frame
        .top
        .clamp(target.top, target.bottom - i64::from(height));
    Rect::new(left as i32, top as i32, width, height)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: (u32, u32) = (520, 400);

    fn r(x: i32, y: i32, w: u32, h: u32) -> Rect {
        Rect::new(x, y, w, h)
    }

    #[test]
    fn a_frame_on_a_display_is_left_alone() {
        let saved = r(100, 100, 1920, 1080);
        assert_eq!(fit(saved, &[r(0, 0, 2560, 1440)], MIN), saved);
    }

    #[test]
    fn a_frame_straddling_two_displays_is_left_alone() {
        let saved = r(1800, 100, 800, 600);
        let displays = [r(0, 0, 1920, 1080), r(1920, 0, 1920, 1080)];
        assert_eq!(fit(saved, &displays, MIN), saved);
    }

    #[test]
    fn a_frame_hanging_off_its_display_is_pulled_on() {
        assert_eq!(
            fit(r(-50, -50, 800, 600), &[r(0, 0, 1920, 1080)], MIN),
            r(0, 0, 800, 600)
        );
    }

    #[test]
    fn a_frame_saved_for_a_gone_display_lands_on_the_one_left() {
        let fitted = fit(r(3000, 200, 3840, 2160), &[r(0, 0, 1366, 768)], MIN);
        assert_eq!(fitted, r(0, 0, 1366, 768));
    }

    #[test]
    fn an_oversized_size_with_an_origin_on_screen_is_still_fitted() {
        // What the window-state plugin leaves when the saved display is gone.
        assert_eq!(
            fit(r(50, 50, 3840, 2160), &[r(0, 0, 1366, 768)], MIN),
            r(0, 0, 1366, 768)
        );
    }

    #[test]
    fn no_displays_leaves_the_frame_alone() {
        let saved = r(10, 10, 800, 600);
        assert_eq!(fit(saved, &[], MIN), saved);
    }

    #[test]
    fn a_closed_window_is_kept_for_the_tray_and_a_second_launch_to_show() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        setup(app.handle(), "main", false, MIN);
        window.close().unwrap();
        assert!(app.get_webview_window("main").is_some());
    }

    #[test]
    fn setup_with_registers_a_close_decision_and_keeps_the_window() {
        // The mock runtime never delivers CloseRequested, so only registration
        // is checked here; the decision itself is one `if` on the callback.
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        setup_with(app.handle(), "main", false, MIN, |_| false);
        assert!(app.get_webview_window("main").is_some());
    }

    // On Linux, single-instance claims a D-Bus name built from the app
    // identifier, which the mock context's is not, so the build fails there.
    #[cfg(not(target_os = "linux"))]
    #[test]
    fn plugins_with_registers_on_a_builder() {
        let builder = plugins_with(tauri::test::mock_builder(), |_| {}, |l| l == "main");
        builder
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
    }
}
