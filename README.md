# telemetry-rs

The household's one Rust telemetry call. It writes no file, exports no metrics, reads no settings, and knows no broker, identity or token: the endpoint and the credential reach it only as standard environment variables the fleet sets.

```toml
telemetry = { git = "https://github.com/poodle64/telemetry-rs", tag = "v0.1.2" }
```

## The one call

```rust
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(Mutex::new(Some(telemetry::init(
                "bragi",
                env!("CARGO_PKG_VERSION"),
                &["bragi"],
            ))));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("build")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                // Tauri drops NO managed state at exit, so this is the only thing
                // that flushes the batch processors. The Exit arm is on the main
                // thread, which is also where the Guard must be dropped.
                let guard = app
                    .state::<Mutex<Option<telemetry::Guard>>>()
                    .lock()
                    .expect("the telemetry guard")
                    .take();
                drop(guard);
            }
        });
}
```

Both halves are required. `app.manage(init(..))` on its own never drops the `Guard`, so whatever the batch processors hold at quit is lost. The state is a `Mutex<Option<Guard>>` because `Manager::unmanage` is deprecated and documented as unsafe — this is upstream's own advice.

Call `init` from the setup hook or `main`, never inside a Tokio task: it builds the exporters' blocking HTTP client. The same goes for the drop — after its bounded flush it joins that client's own runtime thread.

`telemetry::http_client()` returns an async `reqwest` client that carries W3C `traceparent` on every request and opens a client span recording the method, the host and the status — never a path, a query or an error string, any of which can carry a search term or a query-string credential. It sets a ten-second connect timeout, which a caller cannot add per request: only the total timeout has a `RequestBuilder` form, so without it a black-holed LAN address hangs for the whole total timeout instead of failing at connect. Add a per-request `timeout` where a call has its own deadline.

## The variables

| Variable | What it does |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | The bearer-gated front door. Unset means local only. Signal-specific `_LOGS_`/`_TRACES_` endpoints and `_TIMEOUT` are read by the SDK as usual. |
| `OTEL_EXPORTER_OTLP_HEADERS_HELPER` | A command printing a JSON object of header name to header value — `signet headers …` prints exactly this. Run once at init under `sh -c`, bounded to 10 s. |
| `OTEL_EXPORTER_OTLP_HEADERS` | Static headers, in the standard `k=v,k=v` form. The helper's headers win where both set the same name. |
| `RUST_LOG` | The stderr layer only, defaulting to `info`. The developer's view is never allow-listed, though the exporter's own reporting is floored at INFO and capped at one line a minute. |

Batch sizing (`OTEL_BLRP_*`, `OTEL_BSP_*`) and protocol selection are left entirely to the SDK's own defaults and env handling; the crate overrides none of them.

## Local only

Endpoint unset, or a helper that is missing, fails, times out or prints something that is not a JSON object: the crate installs the stderr layer alone, says which condition in one line, and returns a `Guard` anyway. It never errors and never panics, so a stranger's machine running the app behaves exactly this way. A second `init` builds nothing and returns an empty `Guard`.

## The allow-list

An event or span leaves the device only when its `target` equals an allow-list entry or sits beneath one, at INFO or more severe. Everything else stays on stderr. The list lives in the code beside the call, not in a file a user can widen by accident.

```rust
telemetry::init("thoth", env!("CARGO_PKG_VERSION"), &["thoth::playback"]);
tracing::info!(target: "thoth::dictation", "stays on this machine");
```

## Gates

`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test` are enforced in CI, one layer only; pre-commit's `cargo fmt` is a formatter, not a gate.

Contract: `rules-library/platform/telemetry.md`. Wiring: `docs/master/reference/guide-telemetry.md` §Rust.
