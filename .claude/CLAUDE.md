# telemetry

The household's one Rust telemetry call. Every Rust process — Tauri app, daemon, CLI — gets its `tracing` subscriber from here and owns nothing else about logging.

## Scope

- Does: install a stderr `fmt` layer for the developer, and, when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, an allow-listed OTLP/HTTP protobuf log and span exporter carrying `service.name`/`service.version`; run `OTEL_EXPORTER_OTLP_HEADERS_HELPER` once at init for the bearer; set the W3C propagator; hand out a `reqwest` client that injects `traceparent`.
- Does not: write a file, rotate, keep a log directory, push to Loki's own API, export metrics, read a settings file, or know any broker, identity or token. The endpoint and the credential arrive as standard environment variables set by the fleet.
- The public surface is `init(service_name, service_version, allow) -> Guard`, `Guard`, and `http_client()`. Nothing is added to it without the contract changing first.

## The lines that matter

- An event or span leaves the device only if its `target` is on the caller's allow-list. That list is what keeps listening history and dictation local; widen it only with the reason written down.
- A header value, the helper's stdout, and anything derived from them never reach a log line or an error.
- The client span `http_client` opens is force-allowed past the caller's list, so it carries only a method, a host and a status. Never a URL, path, query or error string: `reqwest`'s own error `Display` and `Debug` both carry the full URL, which is why the crate supplies its own span backend rather than `reqwest-tracing`'s default.
- Anything missing, failing or malformed degrades to stderr-only with one `debug!` line. A stranger's machine running the app must behave exactly that way, and `init` must never return an error or panic.
- Batch sizing, protocol selection and timeouts are the SDK's own env handling. The crate overrides none of them: hardcoding a value here takes the standard variable away from the fleet.

Contract: `rules-library/platform/telemetry.md`. Wiring: `docs/master/reference/guide-telemetry.md` §Rust. Design: `poodle64/master-project#314` (07/09/2026), ledger `#330`.
