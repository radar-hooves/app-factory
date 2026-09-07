# telemetry-rs

The household's one Rust telemetry call. It writes no file, exports no metrics, reads no settings, and knows no broker, identity or token: the endpoint and the credential reach it only as standard environment variables the fleet sets.

```toml
telemetry = { git = "https://github.com/poodle64/telemetry-rs", tag = "v0.1.0" }
```

## The one call

```rust
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Hold the Guard for the process lifetime; dropping it flushes.
            app.manage(telemetry::init("bragi", env!("CARGO_PKG_VERSION"), &["bragi"]));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("run");
}
```

Call it from the setup hook or `main`, never inside a Tokio task: it builds the exporters' blocking HTTP client. `telemetry::http_client()` returns an async `reqwest` client that opens a client span and carries W3C `traceparent` on every request.

## The variables

| Variable | What it does |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | The bearer-gated front door. Unset means local only. Signal-specific `_LOGS_`/`_TRACES_` endpoints and `_TIMEOUT` are read by the SDK as usual. |
| `OTEL_EXPORTER_OTLP_HEADERS_HELPER` | A command printing a JSON object of header name to header value — `signet headers …` prints exactly this. Run once at init under `sh -c`, bounded to 10 s. |
| `OTEL_EXPORTER_OTLP_HEADERS` | Static headers, in the standard `k=v,k=v` form. The helper's headers win where both set the same name. |
| `RUST_LOG` | The stderr layer only, defaulting to `info`. The developer's view is never allow-listed. |

## Local only

Endpoint unset, `OTEL_EXPORTER_OTLP_PROTOCOL` asking for grpc (this crate speaks OTLP/HTTP protobuf), or a helper that is missing, fails, times out or prints something that is not a JSON object: the crate installs the stderr layer alone, says which condition in one line, and returns a `Guard` anyway. It never errors and never panics, so a stranger's machine running the app behaves exactly this way.

## The allow-list

An event or span leaves the device only when its `target` equals an allow-list entry or sits beneath one, at INFO or more severe. Everything else stays on stderr. The list lives in the code beside the call, not in a file a user can widen by accident.

```rust
telemetry::init("thoth", env!("CARGO_PKG_VERSION"), &["thoth::playback"]);
tracing::info!(target: "thoth::dictation", "stays on this machine");
```

## Gates

`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo test` are enforced in CI, one layer only; pre-commit's `cargo fmt` is a formatter, not a gate.

Contract: `rules-library/platform/telemetry.md`. Wiring: `docs/master/reference/guide-telemetry.md` §Rust.
