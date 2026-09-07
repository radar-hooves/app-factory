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
mod client;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use opentelemetry::{KeyValue, trace::TracerProvider as _};
use opentelemetry_appender_tracing::layer::OpenTelemetryTracingBridge;
use opentelemetry_sdk::logs::SdkLoggerProvider;
use opentelemetry_sdk::trace::SdkTracerProvider;
use opentelemetry_sdk::{Resource, propagation::TraceContextPropagator};
use opentelemetry_semantic_conventions::resource::SERVICE_VERSION;
use tracing::Metadata;
use tracing::level_filters::LevelFilter;
use tracing_subscriber::filter::{EnvFilter, FilterExt, dynamic_filter_fn};
use tracing_subscriber::layer::{Context, Filter, SubscriberExt};
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{Layer, fmt};

/// The total a drop may spend flushing, so exit is never delayed.
const SHUTDOWN_BUDGET: Duration = Duration::from_secs(2);

/// Claimed by the first [`init`]; a later call builds nothing.
static INITIALISED: AtomicBool = AtomicBool::new(false);

/// The two providers, kept together because they are built and shut down together.
struct Providers {
    logs: SdkLoggerProvider,
    traces: SdkTracerProvider,
}

/// Keeps the export pipeline alive. Hold it for the process lifetime — a Tauri
/// app puts it in managed state — and dropping it flushes and shuts the providers
/// down within [`SHUTDOWN_BUDGET`].
///
/// Drop it from a plain thread, never from a Tokio worker: after that bounded
/// flush the exporters' blocking `reqwest` client is dropped, and its own `Drop`
/// joins the `reqwest-internal-sync-runtime` thread with no timeout of its own.
/// It returns as soon as the channel closes, but it is a blocking join, so a
/// Tokio worker would be parked for its duration.
#[derive(Default)]
pub struct Guard {
    providers: Option<Providers>,
}

impl Drop for Guard {
    fn drop(&mut self) {
        let Some(providers) = self.providers.take() else {
            return;
        };
        let deadline = Instant::now() + SHUTDOWN_BUDGET;
        let left = || deadline.saturating_duration_since(Instant::now());
        let _ = providers.logs.shutdown_with_timeout(left());
        let _ = providers.traces.shutdown_with_timeout(left());
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
/// Never fails: an unset endpoint, or a missing or failing header helper, degrades
/// to stderr only with one line saying which. The only blocking work is the header
/// helper, bounded to ten seconds. A second call builds nothing and returns an
/// empty [`Guard`].
///
/// Call it from a plain thread — a Tauri app's `setup` hook on the main thread,
/// or `main` — and never from inside a Tokio task: it constructs the exporters'
/// blocking `reqwest` client, which panics if built in an async context. The same
/// applies to dropping the [`Guard`].
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
    if INITIALISED.swap(true, Ordering::SeqCst) {
        tracing::debug!("telemetry: init was already called; this call installed nothing");
        return Guard::default();
    }
    opentelemetry::global::set_text_map_propagator(TraceContextPropagator::new());

    let plan = plan();
    let providers = match &plan {
        Plan::LocalOnly { .. } => None,
        Plan::Otlp(headers) => providers(service_name, service_version, headers),
    };
    let installed = subscriber(service_name, allow, providers.as_ref())
        .try_init()
        .is_ok();

    if !installed {
        // Something else owns the global subscriber, so our layers reach nothing.
        // Shut the providers down rather than hand back a live-looking Guard over
        // orphaned exporter threads.
        drop(Guard { providers });
        tracing::debug!("telemetry: another subscriber is installed; this call installed nothing");
        return Guard::default();
    }
    match plan {
        Plan::LocalOnly { why } => tracing::debug!("telemetry is local only: {why}"),
        Plan::Otlp(_) if providers.is_none() => tracing::debug!("telemetry: no exporter built"),
        Plan::Otlp(_) => {}
    }
    Guard { providers }
}

/// An async `reqwest` client whose every request opens a client span and carries
/// W3C `traceparent`. Use it for outbound HTTP instead of building your own.
///
/// The span records the method, the host and the status only — never a path, a
/// query or an error string, all of which can carry private material.
pub fn http_client() -> reqwest_middleware::ClientWithMiddleware {
    ensure_crypto_provider();
    reqwest_middleware::ClientBuilder::new(reqwest::Client::new())
        .with(reqwest_tracing::TracingMiddleware::<
            client::HouseholdSpanBackend,
        >::new())
        .build()
}

/// What the environment asks for.
enum Plan {
    LocalOnly { why: &'static str },
    Otlp(HashMap<String, String>),
}

fn plan() -> Plan {
    if std::env::var_os("OTEL_EXPORTER_OTLP_ENDPOINT").is_none() {
        return Plan::LocalOnly {
            why: "OTEL_EXPORTER_OTLP_ENDPOINT is unset",
        };
    }
    match std::env::var("OTEL_EXPORTER_OTLP_HEADERS_HELPER") {
        Err(_) => Plan::Otlp(HashMap::new()),
        Ok(command) => match bearer::run_helper(&command, Duration::from_secs(10)) {
            Ok(headers) => Plan::Otlp(headers),
            Err(why) => Plan::LocalOnly { why },
        },
    }
}

/// The layer stack, built once and installed either globally by [`init`] or
/// locally by a test through `tracing::subscriber::with_default`.
fn subscriber(
    service_name: &'static str,
    allow: &'static [&'static str],
    providers: Option<&Providers>,
) -> impl tracing::Subscriber + Send + Sync + 'static {
    let stderr = fmt::layer()
        .with_writer(std::io::stderr)
        .with_filter(env_filter().and(exporter_noise_filter()));
    let logs = providers
        .map(|p| OpenTelemetryTracingBridge::new(&p.logs).with_filter(allow::otlp_filter(allow)));
    let traces = providers.map(|p| {
        tracing_opentelemetry::layer()
            .with_tracer(p.traces.tracer(service_name))
            .with_filter(allow::otlp_filter(allow))
    });
    tracing_subscriber::registry()
        .with(stderr)
        .with(logs)
        .with(traces)
}

/// Both providers, or neither. Endpoint, signal endpoints, timeouts, batch sizing
/// (`OTEL_BLRP_*`/`OTEL_BSP_*`) and any static `OTEL_EXPORTER_OTLP_HEADERS` all
/// come from the SDK's own env handling; the helper's headers are stamped on last
/// by the client, so they win.
fn providers(
    service_name: &'static str,
    service_version: &'static str,
    headers: &HashMap<String, String>,
) -> Option<Providers> {
    use opentelemetry_otlp::WithHttpConfig;

    ensure_crypto_provider();
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

    Some(Providers {
        logs: SdkLoggerProvider::builder()
            .with_resource(resource.clone())
            .with_batch_exporter(log_exporter)
            .build(),
        traces: SdkTracerProvider::builder()
            .with_resource(resource)
            .with_batch_exporter(span_exporter)
            .build(),
    })
}

/// The developer's view: `RUST_LOG`, defaulting to `info`, never allow-listed.
fn env_filter() -> EnvFilter {
    EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"))
}

/// How much of the exporter's own reporting reaches stderr.
struct ExporterNoise {
    last: AtomicU64,
    start: Instant,
}

impl ExporterNoise {
    const NEVER: u64 = u64::MAX;

    fn new() -> Self {
        Self {
            last: AtomicU64::new(Self::NEVER),
            start: Instant::now(),
        }
    }

    /// Anything but the exporter passes untouched. The exporter's own debug lines
    /// carry the collector's response body, which upstream itself notes may echo a
    /// token back, so nothing below INFO gets through; what is left is worth one
    /// line a minute, not one per dropped event.
    fn admits(&self, target: &str, level: tracing::Level) -> bool {
        if !target.starts_with("opentelemetry") {
            return true;
        }
        if level > tracing::Level::INFO {
            return false;
        }
        let now = self.start.elapsed().as_secs();
        let previous = self.last.load(Ordering::Relaxed);
        let due = previous == Self::NEVER || now.saturating_sub(previous) >= 60;
        if due {
            self.last.store(now, Ordering::Relaxed);
        }
        due
    }
}

/// The TRACE hint is load-bearing: `And::max_level_hint` is the minimum over two
/// `Option`s and `None` sorts below `Some`, so an unhinted filter here would erase
/// `EnvFilter`'s hint and drop the global maximum to TRACE, evaluating every
/// `debug!`/`trace!` callsite in the process on every hit.
fn exporter_noise_filter<S: 'static>() -> impl Filter<S> + 'static {
    let noise = ExporterNoise::new();
    dynamic_filter_fn(move |meta: &Metadata<'_>, _: &Context<'_, S>| {
        noise.admits(meta.target(), *meta.level())
    })
    .with_callsite_filter(|_| tracing::subscriber::Interest::sometimes())
    .with_max_level_hint(LevelFilter::TRACE)
}

/// rustls needs a process-wide provider and reqwest panics without one under
/// `rustls-no-provider`, so every path that builds a client calls this first.
/// It is a no-op once anything has installed one, which keeps the choice the
/// application's wherever the application has made it.
pub(crate) fn ensure_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

#[cfg(test)]
mod tests {
    use super::*;
    use opentelemetry_sdk::logs::{InMemoryLogExporter, SimpleLogProcessor};
    use opentelemetry_sdk::trace::{InMemorySpanExporter, SimpleSpanProcessor};
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

    fn clear_env() {
        set_env(&[
            ("OTEL_EXPORTER_OTLP_ENDPOINT", None),
            ("OTEL_EXPORTER_OTLP_HEADERS_HELPER", None),
        ]);
    }

    /// The real layer stack over in-memory exporters, so a test sees exactly what
    /// the OTLP layers would have exported.
    fn in_memory() -> (Providers, InMemoryLogExporter, InMemorySpanExporter) {
        let logs = InMemoryLogExporter::default();
        let spans = InMemorySpanExporter::default();
        let providers = Providers {
            logs: SdkLoggerProvider::builder()
                .with_log_processor(SimpleLogProcessor::new(logs.clone()))
                .build(),
            traces: SdkTracerProvider::builder()
                .with_span_processor(SimpleSpanProcessor::new(spans.clone()))
                .build(),
        };
        (providers, logs, spans)
    }

    #[test]
    #[serial]
    fn no_endpoint_means_stderr_only() {
        clear_env();
        assert!(matches!(plan(), Plan::LocalOnly { .. }));
    }

    #[test]
    #[serial]
    fn a_helper_that_fails_means_stderr_only() {
        clear_env();
        set_env(&[
            ("OTEL_EXPORTER_OTLP_ENDPOINT", Some("http://127.0.0.1:9/")),
            ("OTEL_EXPORTER_OTLP_HEADERS_HELPER", Some("exit 3")),
        ]);
        assert!(matches!(plan(), Plan::LocalOnly { .. }));
        clear_env();
    }

    /// `init` is global and runs once per process, so this is the one test that
    /// calls it; everything else drives `subscriber` under `with_default`.
    #[test]
    #[serial]
    fn a_dead_endpoint_neither_blocks_nor_panics_and_a_second_init_builds_nothing() {
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
        assert!(guard.providers.is_some(), "the OTLP providers were built");
        tracing::info!(target: "allowed_target", "allowed");
        tracing::info!(target: "some_other_target", "denied");

        let second = init("test-service", "0.0.0", ALLOW);
        assert!(second.providers.is_none(), "a second init builds nothing");

        drop(guard);
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "init plus a dead-endpoint flush took {:?}",
            started.elapsed()
        );
        clear_env();
    }

    /// `And::max_level_hint` is a minimum over `Option`s and `None` sorts below
    /// `Some`, so dropping the noise filter's hint would put the global maximum at
    /// TRACE and cost every `debug!` callsite in the process a per-hit evaluation.
    #[test]
    #[serial]
    fn the_stderr_filter_keeps_its_level_hint() {
        set_env(&[("RUST_LOG", None)]);
        let hint = tracing::Subscriber::max_level_hint(&subscriber("test", &[], None));
        assert_eq!(hint, Some(LevelFilter::INFO));
    }

    #[test]
    fn the_exporters_own_reporting_is_floored_and_rate_limited() {
        let noise = ExporterNoise::new();
        assert!(
            noise.admits("bragi", tracing::Level::DEBUG),
            "not the exporter"
        );
        assert!(
            !noise.admits("opentelemetry-otlp", tracing::Level::DEBUG),
            "a debug line can carry the collector's response body"
        );
        assert!(noise.admits("opentelemetry_sdk", tracing::Level::ERROR));
        assert!(
            !noise.admits("opentelemetry_sdk", tracing::Level::ERROR),
            "one line a minute, not one per dropped event"
        );
        assert!(
            noise.admits("bragi", tracing::Level::INFO),
            "still untouched"
        );
    }

    #[test]
    fn the_allow_list_holds_for_both_events_and_spans() {
        let (providers, logs, spans) = in_memory();
        tracing::subscriber::with_default(subscriber("test", ALLOW, Some(&providers)), || {
            tracing::info!(target: "allowed_target", "kept");
            tracing::info!(target: "allowed_target::inner", "kept too");
            tracing::info!(target: "another_target", "dropped");
            tracing::debug!(target: "allowed_target", "below the floor");
            tracing::info_span!(target: "allowed_target", "kept span").in_scope(|| {});
            tracing::info_span!(target: "another_target", "dropped span").in_scope(|| {});
        });
        providers.logs.force_flush().expect("flush logs");
        providers.traces.force_flush().expect("flush spans");

        let exported = logs.get_emitted_logs().expect("logs");
        assert_eq!(exported.len(), 2, "{exported:#?}");
        let exported = spans.get_finished_spans().expect("spans");
        let names: Vec<_> = exported.iter().map(|s| s.name.as_ref()).collect();
        assert_eq!(names, ["kept span"], "{names:?}");
    }

    /// The client span must carry no path, no query and no error string, because
    /// its target is force-allowed past the caller's allow-list.
    #[test]
    fn a_failed_request_records_no_url_and_no_error_fields() {
        let (providers, _, spans) = in_memory();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("a runtime");
        tracing::subscriber::with_default(subscriber("test", &[], Some(&providers)), || {
            runtime.block_on(async {
                // Port 1 on loopback refuses immediately; nothing leaves the host.
                let result = http_client()
                    .get("http://127.0.0.1:1/library/search?q=secret-term&t=token")
                    .send()
                    .await;
                assert!(result.is_err(), "the request must fail");
            });
        });
        providers.traces.force_flush().expect("flush spans");

        let exported = spans.get_finished_spans().expect("spans");
        let span = exported.first().expect("the client span was exported");
        let rendered = format!("{:?}", span.attributes);
        for forbidden in ["secret-term", "search", "library", "token", "error."] {
            assert!(!rendered.contains(forbidden), "{forbidden} in {rendered}");
        }
        assert!(rendered.contains("server.address"), "{rendered}");
    }
}
