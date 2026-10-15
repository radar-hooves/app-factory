//! macOS traffic lights (the close, minimise and zoom buttons) centred in an
//! app's own header bar, for a window with `"titleBarStyle": "Overlay"`. A
//! no-op on every other platform, so a caller needs no `cfg` of its own.
//!
//! An empty unified toolbar makes the window's native title bar 52 points
//! tall, so the app's header must be 52 points (`--header-height: 52px`), and
//! AppKit itself lays the buttons out centred in it on every frame, live resize
//! included, at x 19-73 and 26 points down (measured under the 14.4 SDK).
//! Moving them by hand after AppKit has laid them out loses that race on every
//! frame: during a live resize they sit at the top of the window until the
//! mouse comes up, so this module never repositions a button.
//!
//! Native fullscreen drops the toolbar, which AppKit would otherwise show as an
//! empty bar across the top of the screen, and gets it back on the way out.

use tauri::{Runtime, WebviewWindow};

/// Gives the window an empty unified toolbar for life. Main thread only, as
/// Tauri's `setup` is.
pub fn setup<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(target_os = "macos")]
    unsafe {
        use block2::RcBlock;
        use objc2::msg_send;
        use objc2::runtime::{AnyClass, AnyObject};
        use objc2_foundation::NSString;

        const TOOLBAR_STYLE_UNIFIED: isize = 3;
        const TITLEBAR_SEPARATOR_NONE: isize = 1;

        let (Ok(ns_window), Some(toolbar_cls), Some(center_cls)) = (
            window.ns_window(),
            AnyClass::get(c"NSToolbar"),
            AnyClass::get(c"NSNotificationCenter"),
        ) else {
            return;
        };
        let ns_window = ns_window.cast::<AnyObject>();

        // Never released, nor the observers below: the main window lives as
        // long as the app, and fullscreen hands the same toolbar back.
        let toolbar: *mut AnyObject = msg_send![toolbar_cls, alloc];
        let identifier = NSString::from_str("desktop-shell.title-bar");
        let toolbar: *mut AnyObject = msg_send![toolbar, initWithIdentifier: &*identifier];
        // A window restored into fullscreen gets it on the way out.
        if !window.is_fullscreen().unwrap_or(false) {
            let _: () = msg_send![ns_window, setToolbar: toolbar];
        }
        let _: () = msg_send![ns_window, setToolbarStyle: TOOLBAR_STYLE_UNIFIED];
        let _: () = msg_send![ns_window, setTitlebarSeparatorStyle: TITLEBAR_SEPARATOR_NONE];

        let center: *mut AnyObject = msg_send![center_cls, defaultCenter];
        for (name, toolbar) in [
            (
                "NSWindowWillEnterFullScreenNotification",
                std::ptr::null_mut(),
            ),
            ("NSWindowDidExitFullScreenNotification", toolbar),
        ] {
            let block = RcBlock::new(move |_note: *mut AnyObject| {
                let _: () = msg_send![ns_window, setToolbar: toolbar];
            });
            let name = NSString::from_str(name);
            let _: *mut AnyObject = msg_send![center,
                addObserverForName: &*name,
                object: ns_window,
                queue: std::ptr::null_mut::<AnyObject>(),
                usingBlock: &*block
            ];
        }
    }

    #[cfg(not(target_os = "macos"))]
    let _ = window;
}
