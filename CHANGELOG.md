# Changelog

## 0.2.0

The exporter may now arrive from the application's own settings, not only from the fleet's environment: a Tauri app launched from the Dock inherits no environment at all. Added to the public surface — `Exporter` and `Exporter::from_env`, `Guard::set_exporter`, `Guard::exporter`, `Guard::exporter_is_from_env`, and `probe` with `ProbeError`. `set_exporter` swaps the live OTLP log and span layers through a `reload::Layer` and retires the previous providers on a plain thread; the stderr layer never reloads. Where the environment set the exporter it still wins, and `set_exporter` is a no-op. `probe` sends one OTLP/HTTP protobuf log record to `<endpoint>/v1/logs` through the same header client the exporters use and reports a transport class or an HTTP status — never a URL, a header value or a response body.
