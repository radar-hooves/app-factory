//! macOS traffic lights (the close, minimise and zoom buttons) centred in an
//! app's own header bar, for a window with `"titleBarStyle": "Overlay"`. A
//! no-op on every other platform, so a caller needs no `cfg` of its own.

use tauri::{Runtime, WebviewWindow};

/// Places the traffic lights `x` points from the left edge, vertically
/// centred in a header `header_height` points tall.
pub fn position<R: Runtime>(window: &WebviewWindow<R>, x: f64, header_height: f64) {
    #[cfg(target_os = "macos")]
    {
        use objc2::msg_send;
        use objc2::rc::Retained;
        use objc2::runtime::AnyObject;
        use objc2_foundation::{NSPoint, NSRect};

        // The buttons are about 14 points tall.
        const BUTTON_HEIGHT: f64 = 14.0;
        let y = (header_height - BUTTON_HEIGHT) / 2.0;

        let Ok(ns_window) = window.ns_window() else {
            return;
        };
        let ns_window = ns_window.cast::<AnyObject>();

        unsafe {
            // NSWindowCloseButton, NSWindowMiniaturizeButton, NSWindowZoomButton.
            let close: Option<Retained<AnyObject>> =
                msg_send![ns_window, standardWindowButton: 0_isize];
            let miniaturize: Option<Retained<AnyObject>> =
                msg_send![ns_window, standardWindowButton: 1_isize];
            let zoom: Option<Retained<AnyObject>> =
                msg_send![ns_window, standardWindowButton: 2_isize];

            if let (Some(close), Some(miniaturize), Some(zoom)) = (close, miniaturize, zoom) {
                // The title bar container is the close button's superview's superview.
                let title_bar: Option<Retained<AnyObject>> = msg_send![&*close, superview];
                let title_bar: Option<Retained<AnyObject>> =
                    title_bar.and_then(|v| msg_send![&*v, superview]);

                if let Some(title_bar) = title_bar {
                    let window_frame: NSRect = msg_send![ns_window, frame];

                    let mut title_bar_rect: NSRect = msg_send![&*title_bar, frame];
                    title_bar_rect.size.height = header_height;
                    title_bar_rect.origin.y = window_frame.size.height - header_height;
                    let _: () = msg_send![&*title_bar, setFrame: title_bar_rect];

                    let close_frame: NSRect = msg_send![&*close, frame];
                    let miniaturize_frame: NSRect = msg_send![&*miniaturize, frame];
                    let spacing = miniaturize_frame.origin.x - close_frame.origin.x;

                    for (i, button) in [&close, &miniaturize, &zoom].iter().enumerate() {
                        let new_origin = NSPoint::new(x + (i as f64 * spacing), y);
                        let _: () = msg_send![&***button, setFrameOrigin: new_origin];
                    }
                }
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, x, header_height);
    }
}

/// [`position`]s the traffic lights now and again after every resize and
/// focus, which is when macOS puts them back where it keeps them.
pub fn setup<R: Runtime>(window: &WebviewWindow<R>, x: f64, header_height: f64) {
    position(window, x, header_height);

    let target = window.clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(true)
        ) {
            position(&target, x, header_height);
        }
    });
}
