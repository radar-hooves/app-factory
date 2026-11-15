//! `invoke_handler` marks the IPC boundary: a call from the webview is one
//! span named by the command, and a Rust call of the same function is none.

use std::sync::{Arc, Mutex};

use tauri::WebviewWindowBuilder;
use tauri::test::{INVOKE_KEY, get_ipc_response, mock_builder, mock_context, noop_assets};
use tauri::webview::InvokeRequest;
use tracing::span::{Attributes, Id};
use tracing_subscriber::layer::{Context, Layer, SubscriberExt};

#[tauri::command]
fn ping(secret_argument: String) -> String {
    format!("pong {}", secret_argument.len())
}

struct Spans(Arc<Mutex<Vec<(String, String)>>>);

impl<S: tracing::Subscriber> Layer<S> for Spans {
    fn on_new_span(&self, attrs: &Attributes<'_>, _: &Id, _: Context<'_, S>) {
        struct Fields(String);
        impl tracing::field::Visit for Fields {
            fn record_debug(&mut self, f: &tracing::field::Field, v: &dyn std::fmt::Debug) {
                self.0.push_str(&format!(" {}={:?}", f.name(), v));
            }
        }
        let mut fields = Fields(String::new());
        attrs.record(&mut fields);
        self.0
            .lock()
            .unwrap()
            .push((attrs.metadata().target().to_string(), fields.0));
    }
}

#[test]
fn a_webview_call_is_one_named_span_and_a_rust_call_is_none() {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let dispatch = tracing::Dispatch::new(tracing_subscriber::registry().with(Spans(seen.clone())));
    let _guard = tracing::dispatcher::set_default(&dispatch);

    let app = mock_builder()
        .invoke_handler(tauri_plugin_telemetry::invoke_handler(
            tauri::generate_handler![ping],
        ))
        .build(mock_context(noop_assets()))
        .unwrap();
    let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();

    assert_eq!(ping("from rust".into()), "pong 9");
    assert!(seen.lock().unwrap().is_empty(), "a Rust call opened a span");

    let response = get_ipc_response(
        &webview,
        InvokeRequest {
            cmd: "ping".into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            url: "tauri://localhost".parse().unwrap(),
            body: tauri::ipc::InvokeBody::Json(serde_json::json!({
                "secretArgument": "hunter2"
            })),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .unwrap();
    assert_eq!(response.deserialize::<String>().unwrap(), "pong 7");

    let spans = seen.lock().unwrap().clone();
    assert_eq!(spans.len(), 1, "{spans:?}");
    assert_eq!(spans[0].0, tauri_plugin_telemetry::COMMAND_SPAN_TARGET);
    assert!(spans[0].1.contains("command=\"ping\""), "{spans:?}");
    assert!(!spans[0].1.contains("hunter2"), "{spans:?}");
}
