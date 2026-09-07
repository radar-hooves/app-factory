//! The household's one Rust telemetry call.
//!
//! [`init`] installs a stderr layer for the developer and, when the fleet has set
//! `OTEL_EXPORTER_OTLP_ENDPOINT`, an allow-listed OTLP/HTTP protobuf log and span
//! exporter for the corpus; [`http_client`] carries W3C trace context outbound.
//! The crate writes no file, exports no metrics, reads no settings, and knows no
//! broker, identity or token — endpoint and credential arrive only as standard
//! `OTEL_EXPORTER_OTLP_*` variables.
//!
//! Contract: `rules-library/platform/telemetry.md`; wiring:
//! `docs/master/reference/guide-telemetry.md` §Rust.

mod allow;
mod bearer;

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use opentelemetry::KeyValue;
use opentelemetry::trace::TracerProvider as _;
use opentelemetry_appender_tracing::layer::OpenTelemetryTracingBridge;
use opentelemetry_sdk::logs::{
    BatchConfigBuilder as LogBatch, BatchLogProcessor, SdkLoggerProvider,
};
use opentelemetry_sdk::trace::{
    BatchConfigBuilder as SpanBatch, BatchSpanProcessor, SdkTracerProvider,
};
use opentelemetry_sdk::{Resource, propagation::TraceContextPropagator};
use opentelemetry_semantic_conventions::resource::SERVICE_VERSION;
use tracing::Metadata;
use tracing_subscriber::filter::{EnvFilter, FilterExt, dynamic_filter_fn};
use tracing_subscriber::layer::{Context, Filter, SubscriberExt};
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{Layer, fmt};

/// Events queued for export before the batch processor drops them, and the total
/// a drop may spend flushing so exit is never delayed.
const QUEUE: usize = 2048;
const SHUTDOWN_BUDGET: Duration = Duration::from_secs(2);

/// Keeps the export pipeline alive. Hold it for the process lifetime — a Tauri
/// app puts it in managed state — and dropping it flushes and shuts the
/// providers down within [`SHUTDOWN_BUDGET`].
pub struct Guard {
    logs: Option<SdkLoggerProvider>,
    traces: Option<SdkTracerProvider>,
}

impl Drop for Guard {
    fn drop(&mut self) {
        let deadline = Instant::now() + SHUTDOWN_BUDGET;
        if let Some(logs) = self.logs.take() {
            let _ = logs.shutdown_with_timeout(deadline.saturating_duration_since(Instant::now()));
        }
        if let Some(traces) = self.traces.take() {
            let _ =
                traces.shutdown_with_timeout(deadline.saturating_duration_since(Instant::now()));
        }
    }
}

/// Install the process's telemetry. Call once, at the entry point, before
/// anything logs, and keep the returned [`Guard`] for the process lifetime.
///
/// `allow` is the list of `tracing` targets whose events and spans may leave the
/// device: a target matches when it equals an entry or sits beneath one
/// (`bragi` allows `bragi::library`). Everything else stays on stderr. That list
/// is the application's own decision and belongs in its code, not in a file a
/// user can widen by accident.
///
/// Never fails: an unset endpoint, a missing or failing header helper, or a grpc
/// protocol request all degrade to stderr only, with one line saying which. The
/// only blocking work is the header helper, bounded to ten seconds.
///
/// Call it from a plain thread — a Tauri app's `setup` hook on the main thread,
/// or `main` — and never from inside a Tokio task: it constructs the exporters'
/// blocking `reqwest` client, which panics if built in an async context.
///
/// ```no_run
/// # struct App;
/// # impl App { fn manage<T>(&self, _: T) {} }
/// # fn setup(app: &App) {
/// app.manage(telemetry::init("bragi", env!("CARGO_PKG_VERSION"), &["bragi"]));
/// # }
/// ```
pub fn init(
    service_name: &'static str,
    service_version: &'static str,
    allow: &'static [&'static str],
) -> Guard {
    ensure_crypto_provider();
    opentelemetry::global::set_text_map_propagator(TraceContextPropagator::new());

    let plan = plan();
    let providers = match &plan {
        Plan::LocalOnly { .. } => None,
        Plan::Otlp(headers) => providers(service_name, service_version, headers),
    };

    let stderr = fmt::layer()
        .with_writer(std::io::stderr)
        .with_filter(env_filter().and(exporter_noise_filter()));
    let logs = providers.as_ref().map(|(logs, _)| {
        OpenTelemetryTracingBridge::new(logs).with_filter(allow::otlp_filter(allow))
    });
    let traces = providers.as_ref().map(|(_, traces)| {
        tracing_opentelemetry::layer()
            .with_tracer(traces.tracer(service_name))
            .with_filter(allow::otlp_filter(allow))
    });
    let _ = tracing_subscriber::registry()
        .with(stderr)
        .with(logs)
        .with(traces)
        .try_init();

    match plan {
        Plan::LocalOnly { why, warn: true } => tracing::warn!("telemetry is local only: {why}"),
        Plan::LocalOnly { why, .. } => tracing::debug!("telemetry is local only: {why}"),
        Plan::Otlp(_) if providers.is_none() => tracing::debug!("telemetry: no exporter built"),
        Plan::Otlp(_) => {}
    }

    let (logs, traces) = providers.map_or((None, None), |(l, t)| (Some(l), Some(t)));
    Guard { logs, traces }
}

/// An async `reqwest` client whose every request opens a client span and carries
/// W3C `traceparent`. Use it for outbound HTTP instead of building your own.
pub fn http_client() -> reqwest_middleware::ClientWithMiddleware {
    ensure_crypto_provider();
    reqwest_middleware::ClientBuilder::new(reqwest::Client::new())
        .with(reqwest_tracing::TracingMiddleware::default())
        .build()
}

/// What the environment asks for.
enum Plan {
    LocalOnly { why: &'static str, warn: bool },
    Otlp(HashMap<String, String>),
}

fn plan() -> Plan {
    if std::env::var_os("OTEL_EXPORTER_OTLP_ENDPOINT").is_none() {
        return Plan::LocalOnly {
            why: "OTEL_EXPORTER_OTLP_ENDPOINT is unset",
            warn: false,
        };
    }
    if std::env::var("OTEL_EXPORTER_OTLP_PROTOCOL").is_ok_and(|p| p.trim().starts_with("grpc")) {
        return Plan::LocalOnly {
            why: "OTEL_EXPORTER_OTLP_PROTOCOL asks for grpc and this crate speaks OTLP/HTTP protobuf only",
            warn: true,
        };
    }
    match std::env::var("OTEL_EXPORTER_OTLP_HEADERS_HELPER") {
        Err(_) => Plan::Otlp(HashMap::new()),
        Ok(command) => match bearer::run_helper(&command, Duration::from_secs(10)) {
            Ok(headers) => Plan::Otlp(headers),
            Err(why) => Plan::LocalOnly { why, warn: false },
        },
    }
}

/// Both providers, or neither. Endpoint, signal endpoints and any static
/// `OTEL_EXPORTER_OTLP_HEADERS` come from the SDK's own env handling; the helper's
/// headers are stamped on last by the client, so they win.
fn providers(
    service_name: &'static str,
    service_version: &'static str,
    headers: &HashMap<String, String>,
) -> Option<(SdkLoggerProvider, SdkTracerProvider)> {
    use opentelemetry_otlp::WithHttpConfig;

    let resource = Resource::builder_empty()
        .with_service_name(service_name)
        .with_attribute(KeyValue::new(SERVICE_VERSION, service_version))
        .build();
    let client = |timeout_var| bearer::HeaderClient::new(bearer::timeout(timeout_var), headers);

    let log_exporter = opentelemetry_otlp::LogExporter::builder()
        .with_http()
        .with_http_client(client("OTEL_EXPORTER_OTLP_LOGS_TIMEOUT")?)
        .build()
        .ok()?;
    let span_exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_http()
        .with_http_client(client("OTEL_EXPORTER_OTLP_TRACES_TIMEOUT")?)
        .build()
        .ok()?;

    let logs = SdkLoggerProvider::builder()
        .with_resource(resource.clone())
        .with_log_processor(
            BatchLogProcessor::builder(log_exporter)
                .with_batch_config(LogBatch::default().with_max_queue_size(QUEUE).build())
                .build(),
        )
        .build();
    let traces = SdkTracerProvider::builder()
        .with_resource(resource)
        .with_span_processor(
            BatchSpanProcessor::builder(span_exporter)
                .with_batch_config(SpanBatch::default().with_max_queue_size(QUEUE).build())
                .build(),
        )
        .build();
    Some((logs, traces))
}

/// The developer's view: `RUST_LOG`, defaulting to `info`, never allow-listed.
fn env_filter() -> EnvFilter {
    EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"))
}

/// The exporter's own failures are worth one stderr line a minute, not one per
/// dropped event.
fn exporter_noise_filter<S: 'static>() -> impl Filter<S> + 'static {
    const NEVER: u64 = u64::MAX;
    let last = AtomicU64::new(NEVER);
    let start = Instant::now();
    dynamic_filter_fn(move |meta: &Metadata<'_>, _: &Context<'_, S>| {
        if !meta.target().starts_with("opentelemetry") {
            return true;
        }
        let now = start.elapsed().as_secs();
        let previous = last.load(Ordering::Relaxed);
        let due = previous == NEVER || now.saturating_sub(previous) >= 60;
        if due {
            last.store(now, Ordering::Relaxed);
        }
        due
    })
    .with_callsite_filter(|_| tracing::subscriber::Interest::sometimes())
}

/// rustls needs a process-wide provider; ring keeps aws-lc-sys out of a
/// consumer's build, and installing it here is a no-op if the app already did.
fn ensure_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

#[cfg(test)]
mod tests {
    use super::*;
    use opentelemetry_sdk::logs::{InMemoryLogExporter, SimpleLogProcessor};
    use serial_test::serial;

    const ALLOW: &[&str] = &["allowed_target"];

    /// SAFETY: every test that touches the environment is `#[serial]`, and no
    /// other test in this crate reads it.
    fn set_env(pairs: &[(&str, Option<&str>)]) {
        for (name, value) in pairs {
            match value {
                Some(value) => unsafe { std::env::set_var(name, value) },
                None => unsafe { std::env::remove_var(name) },
            }
        }
    }

    const OTLP_VARS: &[&str] = &[
        "OTEL_EXPORTER_OTLP_ENDPOINT",
        "OTEL_EXPORTER_OTLP_PROTOCOL",
        "OTEL_EXPORTER_OTLP_HEADERS_HELPER",
    ];

    fn clear_env() {
        set_env(&OTLP_VARS.iter().map(|n| (*n, None)).collect::<Vec<_>>());
    }

    #[test]
    #[serial]
    fn no_endpoint_means_stderr_only() {
        clear_env();
        assert!(matches!(plan(), Plan::LocalOnly { warn: false, .. }));
        let guard = init("test-service", "0.0.0", ALLOW);
        assert!(guard.logs.is_none() && guard.traces.is_none());
    }

    #[test]
    #[serial]
    fn grpc_is_refused_loudly_and_locally() {
        clear_env();
        set_env(&[
            ("OTEL_EXPORTER_OTLP_ENDPOINT", Some("http://127.0.0.1:9/")),
            ("OTEL_EXPORTER_OTLP_PROTOCOL", Some("grpc")),
        ]);
        assert!(matches!(plan(), Plan::LocalOnly { warn: true, .. }));
        clear_env();
    }

    #[test]
    #[serial]
    fn a_dead_endpoint_neither_blocks_nor_panics() {
        clear_env();
        set_env(&[
            ("OTEL_EXPORTER_OTLP_ENDPOINT", Some("http://127.0.0.1:9/")),
            (
                "OTEL_EXPORTER_OTLP_HEADERS_HELPER",
                Some(r#"printf '{"Authorization":"Bearer test"}'"#),
            ),
        ]);
        let started = Instant::now();
        let guard = init("test-service", "0.0.0", ALLOW);
        assert!(guard.logs.is_some(), "the OTLP providers were built");
        tracing::info!(target: "allowed_target", "allowed");
        tracing::info!(target: "some_other_target", "denied");
        drop(guard);
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "init plus a dead-endpoint flush took {:?}",
            started.elapsed()
        );
        clear_env();
    }

    /// The allow-list, proven at the layer rather than at the predicate.
    #[test]
    fn only_allowed_targets_reach_the_otlp_log_layer() {
        let exporter = InMemoryLogExporter::default();
        let provider = SdkLoggerProvider::builder()
            .with_log_processor(SimpleLogProcessor::new(exporter.clone()))
            .build();
        let subscriber = tracing_subscriber::registry().with(
            OpenTelemetryTracingBridge::new(&provider).with_filter(allow::otlp_filter(ALLOW)),
        );
        tracing::subscriber::with_default(subscriber, || {
            tracing::info!(target: "allowed_target", "kept");
            tracing::info!(target: "allowed_target::inner", "kept too");
            tracing::info!(target: "another_target", "dropped");
            tracing::debug!(target: "allowed_target", "below the floor");
        });
        provider.force_flush().expect("flush");

        let exported = exporter.get_emitted_logs().expect("logs");
        assert_eq!(exported.len(), 2, "{exported:#?}");
    }
}
