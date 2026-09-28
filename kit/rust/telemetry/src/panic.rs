//! The one crash event, and the two error events beside it.
//!
//! A panic anywhere in the process is reported as one ERROR event on this
//! crate's own force-allowed target (`allow::allowed` treats it exactly as it
//! treats `client::TARGET`), carrying the thread name, the panic location, the
//! full message and a forced backtrace, always: this is the operator's own
//! stack, the OTLP endpoint is his own self-hosted collector, and nothing here
//! leaves his estate. See the CHANGELOG for his ruling in his own words. A
//! failed request's URL is a different case, still withheld by `client.rs`:
//! that value can carry a search term or a query-string credential, where a
//! panic payload built inside this crate's own process cannot.
//!
//! [`report_error`] stays the content-free target for an application that has
//! no [`std::error::Error`] to hand — `context` is typed `&'static str`, so
//! only a compile-time literal can be passed without deliberately defeating
//! `&'static`. [`report_error_with_cause`] is its companion: it takes the
//! error itself and carries its full message and its whole `source()` chain,
//! so a caller stops flattening a real error to a static label.

use std::cell::Cell;
use std::panic::PanicHookInfo;
use std::sync::Mutex;
use std::time::Duration;

use opentelemetry_sdk::logs::SdkLoggerProvider;

/// This crate's own force-allowed target — a crash or a caught error is never
/// a listening history or a dictation string, so it needs no allow-list entry
/// from the caller, exactly as `client::TARGET` needs none.
pub(crate) const TARGET: &str = "telemetry::panic";

/// How long the panic hook waits for its own flush. The same figure as
/// [`crate::SHUTDOWN_BUDGET`] — a separate constant because a panic hook that
/// waited longer would risk delaying whatever the process does next: an abort
/// happens the instant this hook returns, in a release profile built with
/// `panic = "abort"`, which is common in a Tauri app to shrink the binary.
const FLUSH_BUDGET: Duration = Duration::from_secs(2);

/// The live logs provider the hook flushes through, mirrored beside whichever
/// `Guard` currently owns the pipeline. The hook is process-global — installed
/// once, outliving any one `Guard::set_exporter` swap — so it cannot borrow a
/// single `Guard`'s own field; this is the one place both sides agree on.
static LIVE: Mutex<Option<SdkLoggerProvider>> = Mutex::new(None);

thread_local! {
    /// Set for the lifetime of the one thread [`flush`] spawns to call
    /// `force_flush`, and nowhere else. If the exporter panics from inside
    /// that call, the panic hook fires again — hooks are process-global, not
    /// per-thread — on this very thread, and this flag is how [`report`] tells
    /// that case apart from an unrelated panic on some other thread: it must
    /// not spawn a second worker from inside the first, which is exactly the
    /// unbounded recursion a broken exporter would otherwise trigger.
    static IS_FLUSH_WORKER: Cell<bool> = const { Cell::new(false) };
}

/// Point the panic hook at the currently live logs provider, or at none.
/// Called wherever `lib.rs` starts or replaces one: [`crate::init`] for the
/// first, [`crate::Guard::install`] for every swap after it, and `Guard`'s
/// `Drop` on the way out.
pub(crate) fn set_live(logs: Option<&SdkLoggerProvider>) {
    if let Ok(mut live) = LIVE.lock() {
        *live = logs.cloned();
    }
}

/// Install the crash reporter, chained to whatever hook is already in place —
/// Rust's own default, or an app's, when `init` runs after the app set one.
/// It never replaces that hook, only wraps it, so the default stderr panic
/// message (and `RUST_BACKTRACE`) still prints exactly as it would have, and
/// an app's own hook still runs too.
pub(crate) fn install() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        report(info);
        previous(info);
    }));
}

/// Emit the crash as one ERROR event and flush it, bounded, before returning
/// control to the chained hook.
///
/// Never panics, never blocks longer than [`FLUSH_BUDGET`], and never
/// recurses: a panic on [`flush`]'s own worker thread — the exporter itself
/// breaking — hits this same hook again, since a hook is process-global, and
/// [`IS_FLUSH_WORKER`] is what stops it spawning a second worker from inside
/// the first. That thread's default panic output still prints, through
/// whatever hook this one is chained to; it only skips another report.
fn report(info: &PanicHookInfo<'_>) {
    if IS_FLUSH_WORKER.with(Cell::get) {
        return;
    }
    let thread = std::thread::current();
    let thread = thread.name().unwrap_or("<unnamed>");
    let (file, line) = info
        .location()
        .map(|l| (l.file(), l.line()))
        .unwrap_or(("<unknown>", 0));
    let payload = payload_message(info.payload());
    // `force_capture` ignores `RUST_BACKTRACE`: a crash on a stranger's
    // machine, or a fleet host that never set the variable, still carries one.
    let backtrace = std::backtrace::Backtrace::force_capture();

    tracing::error!(target: TARGET, thread, file, line, payload, backtrace = %backtrace, "panic");
    flush();
}

/// A content-free way to record that something went wrong, for an application
/// that has no [`std::error::Error`] to hand and would otherwise hand-roll its
/// own force-allowed target for a caught error. `context` is a compile-time
/// literal by construction: `&'static str` cannot carry a value built at
/// runtime without deliberately leaking one, the same trust boundary `init`'s
/// own `allow: &'static [&'static str]` already rests on.
///
/// [`report_error_with_cause`] is the companion for a caller that does have
/// the error itself and wants its message and cause chain carried too.
pub fn report_error(context: &'static str) {
    tracing::error!(target: TARGET, context, "error");
}

/// The same force-allowed target as [`report_error`], carrying the error's own
/// full `Display` message and its whole `source()` chain, so a caller stops
/// flattening a real error to a static label. `context` still identifies the
/// call site, exactly as it does for [`report_error`].
///
/// A `reqwest::Error` or `reqwest_middleware::Error` anywhere in `error`'s own
/// chain has its URL scrubbed from the joined text first — see
/// [`scrub_urls`]. `error` takes `+ 'static` (tightened on the operator's
/// ruling of 28/09/2026, `full-stack-app-template#55`) so this can downcast
/// it; every real caller already hands over an owned error type, so no
/// existing call site is affected.
pub fn report_error_with_cause(context: &'static str, error: &(dyn std::error::Error + 'static)) {
    let chain = error_chain(error);
    tracing::error!(target: TARGET, context, chain, "error");
}

/// How deep to walk a `source()` chain looking for a `reqwest`/
/// `reqwest_middleware` error to scrub. Matches `probe::CHAIN_DEPTH`'s own
/// bound for the same reason: a cyclic chain must not spin forever.
const URL_SCRUB_DEPTH: usize = 8;

/// The error's own message, then each `source()` after it, joined so the
/// whole chain reads as one line: an app's error wraps a lower one for a
/// reason, and the reason is only visible with both ends of the chain.
fn error_chain(error: &(dyn std::error::Error + 'static)) -> String {
    let mut chain = error.to_string();
    let mut source = error.source();
    while let Some(cause) = source {
        chain.push_str(": ");
        chain.push_str(&cause.to_string());
        source = cause.source();
    }
    scrub_urls(error, &mut chain);
    chain
}

/// Replace every URL a `reqwest::Error` or `reqwest_middleware::Error`
/// anywhere in `error`'s own chain carries, wherever it appears in `chain`'s
/// text — including inside another error's own `Display`, which is how a
/// `reqwest_middleware::Error` carries one too (`#[error(transparent)]`
/// forwards straight to the inner `reqwest::Error`'s rendering). A query
/// string can hold a signed token (a Subsonic request signs its own there),
/// so this is what makes `.without_url()` impossible to forget: a caller
/// used to have to remember it at every call site (as `mediaserver/subsonic/
/// client.rs` still does, in the app this crate serves); this function never
/// trusted `Display` or `Debug` not to have embedded a URL in the first
/// place, so there is nothing left for a caller to forget.
///
/// `reqwest::Error::url()` and `reqwest_middleware::Error::url()` are the two
/// accessors that hand a URL back without rendering the error at all.
fn scrub_urls(error: &(dyn std::error::Error + 'static), chain: &mut String) {
    let mut current: Option<&(dyn std::error::Error + 'static)> = Some(error);
    for _ in 0..URL_SCRUB_DEPTH {
        let Some(err) = current else { break };
        let url = err
            .downcast_ref::<reqwest::Error>()
            .and_then(reqwest::Error::url)
            .or_else(|| {
                err.downcast_ref::<reqwest_middleware::Error>()
                    .and_then(reqwest_middleware::Error::url)
            });
        if let Some(url) = url {
            *chain = chain.replace(url.as_str(), "<url withheld>");
        }
        current = err.source();
    }
}

/// `panic!("literal")`, `unreachable!()` and `todo!()` all downcast to
/// `&'static str` — a payload fixed at compile time. `panic!("{}", x)` and
/// `.expect(&built_string)` downcast to `String` instead. Both are exported in
/// full; only a payload built with `panic_any` of some third type — neither
/// shape the standard library's own panicking path ever produces — falls back
/// to a fixed placeholder, since there is nothing safe to assume about a type
/// this crate cannot name.
fn payload_message(payload: &(dyn std::any::Any + Send)) -> &str {
    payload
        .downcast_ref::<&str>()
        .copied()
        .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
        .unwrap_or("<panic payload was neither &str nor String>")
}

/// Force-flush the live logs provider on a thread of its own, bounded by
/// [`FLUSH_BUDGET`]. A thread of its own, rather than a call right here,
/// because `force_flush` can itself hang or panic if the exporter is what
/// broke; either way this function returns at the deadline instead of waiting
/// on it, and a panic on that other thread only ever kills that thread — after
/// marking it with [`IS_FLUSH_WORKER`] first, so [`report`] recognises that
/// panic as its own worker rather than spawning another one.
///
/// A `try_lock` stands in for a normal blocking one for the same reason: a
/// panic raised while some other caller is already inside `set_live`, on the
/// same thread that is now trying to read [`LIVE`], would otherwise deadlock
/// this hook against itself. `try_lock` cannot block, so that case degrades to
/// "this crash was not flushed" instead.
fn flush() {
    let Ok(guard) = LIVE.try_lock() else { return };
    let Some(logs) = guard.clone() else { return };
    drop(guard);

    let (tx, rx) = std::sync::mpsc::channel();
    if std::thread::Builder::new()
        .spawn(move || {
            IS_FLUSH_WORKER.with(|flag| flag.set(true));
            let _ = logs.force_flush();
            let _ = tx.send(());
        })
        .is_ok()
    {
        let _ = rx.recv_timeout(FLUSH_BUDGET);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Providers, otlp_layers, subscriber};
    use opentelemetry::InstrumentationScope;
    use opentelemetry::logs::AnyValue;
    use opentelemetry_sdk::Resource;
    use opentelemetry_sdk::logs::{
        InMemoryLogExporter, LogProcessor, SdkLogRecord, SimpleLogProcessor,
    };
    use opentelemetry_sdk::trace::{InMemorySpanExporter, SimpleSpanProcessor};
    use serial_test::serial;
    use std::fmt;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::time::Instant;

    /// A root cause two levels down from what a caller actually catches, so a
    /// test can prove the whole `source()` chain is carried, not just the
    /// top-level error's own message.
    #[derive(Debug)]
    struct RootCause;

    impl fmt::Display for RootCause {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(f, "the root cause")
        }
    }

    impl std::error::Error for RootCause {}

    #[derive(Debug)]
    struct WrappingError(RootCause);

    impl fmt::Display for WrappingError {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(f, "the wrapping failure")
        }
    }

    impl std::error::Error for WrappingError {
        fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
            Some(&self.0)
        }
    }

    /// An attribute's value, rendered the way its own type would render it —
    /// `String` as itself, anything else through `Debug` — so a test can read
    /// a specific field without depending on how the whole record's `Debug`
    /// escapes it.
    fn attribute(record: &SdkLogRecord, key: &str) -> Option<String> {
        record.attributes_iter().find_map(|(k, v)| {
            (k.as_str() == key).then(|| match v {
                AnyValue::String(s) => s.as_str().to_owned(),
                other => format!("{other:?}"),
            })
        })
    }

    fn in_memory() -> (Providers, InMemoryLogExporter) {
        let logs = InMemoryLogExporter::default();
        let spans = InMemorySpanExporter::default();
        let providers = Providers {
            logs: SdkLoggerProvider::builder()
                .with_log_processor(SimpleLogProcessor::new(logs.clone()))
                .build(),
            traces: opentelemetry_sdk::trace::SdkTracerProvider::builder()
                .with_span_processor(SimpleSpanProcessor::new(spans))
                .build(),
        };
        (providers, logs)
    }

    /// Run `f` (which must panic) under a hook that calls only [`report`],
    /// never chaining anywhere, and restore whatever hook was live before —
    /// so these tests never leave the process's panic hook in a state another
    /// test would inherit.
    fn under_bare_report_hook(f: impl FnOnce()) {
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(report));
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(f));
        std::panic::set_hook(previous);
    }

    #[test]
    #[serial]
    fn a_literal_payload_panic_exports_its_message() {
        let (providers, logs) = in_memory();
        set_live(Some(&providers.logs));
        let (subscriber, _reload) = subscriber(&[], otlp_layers("test-service", &providers));

        tracing::subscriber::with_default(subscriber, || {
            under_bare_report_hook(|| panic!("a literal panic message"));
        });
        set_live(None);

        let exported = logs.get_emitted_logs().expect("logs");
        let rendered = format!("{exported:?}");
        assert!(rendered.contains("a literal panic message"), "{rendered}");
        assert!(rendered.contains("panic.rs"), "{rendered}");
    }

    /// The operator's ruling of 28/09/2026 replaces the v0.3.0 rule that
    /// withheld this shape of payload: a formatted panic must now export its
    /// full message and a backtrace, forced regardless of `RUST_BACKTRACE`.
    #[test]
    #[serial]
    fn a_formatted_panic_exports_its_full_message_and_a_backtrace() {
        let (providers, logs) = in_memory();
        set_live(Some(&providers.logs));
        let (subscriber, _reload) = subscriber(&[], otlp_layers("test-service", &providers));

        let runtime_value = "a-runtime-value-built-at-panic-time".to_owned();
        tracing::subscriber::with_default(subscriber, || {
            under_bare_report_hook(move || panic!("{runtime_value}"));
        });
        set_live(None);

        let exported = logs.get_emitted_logs().expect("logs");
        let record = exported.first().expect("one crash event");
        let payload = attribute(&record.record, "payload").expect("a payload field");
        assert!(
            payload.contains("a-runtime-value-built-at-panic-time"),
            "{payload}"
        );

        let backtrace = attribute(&record.record, "backtrace").expect("a backtrace field");
        assert!(
            backtrace.len() > 100,
            "a forced backtrace should carry more than a placeholder: {backtrace}"
        );
    }

    #[test]
    #[serial]
    fn report_error_with_cause_exports_the_whole_source_chain() {
        let (providers, logs) = in_memory();
        set_live(Some(&providers.logs));
        let (subscriber, _reload) = subscriber(&[], otlp_layers("test-service", &providers));

        tracing::subscriber::with_default(subscriber, || {
            report_error_with_cause("thing failed", &WrappingError(RootCause));
        });
        set_live(None);

        let exported = logs.get_emitted_logs().expect("logs");
        let record = exported.first().expect("one error event");
        let chain = attribute(&record.record, "chain").expect("a chain field");
        assert!(chain.contains("the wrapping failure"), "{chain}");
        assert!(chain.contains("the root cause"), "{chain}");
    }

    /// A bare `reqwest::Error`, passed the way a caller who forgot
    /// `.without_url()` would pass it — `mediaserver/subsonic/client.rs`
    /// still calls it explicitly today, which is exactly the shape a caller
    /// can forget. `reqwest::Error`'s own `Display` appends `" for url
    /// (...)"`, so this proves the scrub runs even on the top-level error,
    /// not only on something nested under `source()`.
    #[test]
    #[serial]
    fn report_error_with_cause_scrubs_a_bare_reqwest_errors_url() {
        let (providers, logs) = in_memory();
        set_live(Some(&providers.logs));
        let (subscriber, _reload) = subscriber(&[], otlp_layers("test-service", &providers));

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("a runtime");
        tracing::subscriber::with_default(subscriber, || {
            runtime.block_on(async {
                crate::ensure_crypto_provider();
                // Port 1 on loopback refuses immediately; nothing leaves the host.
                let error = reqwest::Client::new()
                    .get("http://127.0.0.1:1/rest/search3.view?u=demo&t=leaked-token&s=salt")
                    .send()
                    .await
                    .expect_err("port 1 refuses a connection");
                report_error_with_cause("request failed", &error);
            });
        });
        set_live(None);

        let exported = logs.get_emitted_logs().expect("logs");
        let record = exported.first().expect("one error event");
        let chain = attribute(&record.record, "chain").expect("a chain field");
        for forbidden in ["leaked-token", "demo", "salt", "127.0.0.1:1"] {
            assert!(!chain.contains(forbidden), "{forbidden} in {chain}");
        }
        assert!(chain.contains("<url withheld>"), "{chain}");
    }

    /// The same proof through `reqwest_middleware::Error` — what
    /// `crate::http_client()` actually hands a caller — since `#[error(
    /// transparent)]` makes it a DIFFERENT concrete type wrapping the
    /// `reqwest::Error` rather than one, so the scrub has to recognise both.
    #[test]
    #[serial]
    fn report_error_with_cause_scrubs_a_middleware_errors_url() {
        let (providers, logs) = in_memory();
        set_live(Some(&providers.logs));
        let (subscriber, _reload) = subscriber(&[], otlp_layers("test-service", &providers));

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("a runtime");
        tracing::subscriber::with_default(subscriber, || {
            runtime.block_on(async {
                // Port 1 on loopback refuses immediately; nothing leaves the host.
                let error = crate::http_client()
                    .get("http://127.0.0.1:1/rest/search3.view?u=demo&t=leaked-token&s=salt")
                    .send()
                    .await
                    .expect_err("port 1 refuses a connection");
                report_error_with_cause("request failed", &error);
            });
        });
        set_live(None);

        let exported = logs.get_emitted_logs().expect("logs");
        let record = exported.first().expect("one error event");
        let chain = attribute(&record.record, "chain").expect("a chain field");
        for forbidden in ["leaked-token", "demo", "salt", "127.0.0.1:1"] {
            assert!(!chain.contains(forbidden), "{forbidden} in {chain}");
        }
        assert!(chain.contains("<url withheld>"), "{chain}");
    }

    #[test]
    #[serial]
    fn the_hook_chains_to_whatever_was_there_before() {
        set_live(None);
        let ran_previous = Arc::new(AtomicBool::new(false));
        let marker = Arc::clone(&ran_previous);
        let outer_previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |_| {
            marker.store(true, Ordering::SeqCst);
        }));

        install();
        let _ = std::panic::catch_unwind(|| panic!("chained"));

        std::panic::set_hook(outer_previous);
        assert!(
            ran_previous.load(Ordering::SeqCst),
            "the hook that was live before install() must still run"
        );
    }

    /// A processor whose own `force_flush` panics, standing in for an exporter
    /// that breaks while exporting the crash it is meant to carry, and counts
    /// how many times it was actually called — the number that proves whether
    /// the hook recursed into a second flush attempt or not.
    #[derive(Debug, Clone)]
    struct PanicsOnFlush {
        calls: Arc<AtomicUsize>,
    }

    impl LogProcessor for PanicsOnFlush {
        fn emit(&self, _record: &mut SdkLogRecord, _scope: &InstrumentationScope) {}

        fn force_flush(&self) -> opentelemetry_sdk::error::OTelSdkResult {
            self.calls.fetch_add(1, Ordering::SeqCst);
            panic!("the exporter itself panicked");
        }
    }

    #[test]
    #[serial]
    fn a_panic_inside_export_does_not_hang_or_recurse() {
        let calls = Arc::new(AtomicUsize::new(0));
        let logs = SdkLoggerProvider::builder()
            .with_resource(Resource::builder_empty().build())
            .with_log_processor(PanicsOnFlush {
                calls: Arc::clone(&calls),
            })
            .build();
        set_live(Some(&logs));

        let started = Instant::now();
        under_bare_report_hook(|| panic!("a literal panic message"));
        set_live(None);

        assert!(
            started.elapsed() < Duration::from_secs(5),
            "a panicking exporter must not hang the reporting hook: took {:?}",
            started.elapsed()
        );
        // A worker thread that spawned another on its own panic would keep
        // doing so well past this test's own bounded wait; give that failure
        // mode a moment to show itself before trusting the count.
        std::thread::sleep(Duration::from_millis(500));
        assert_eq!(
            calls.load(Ordering::SeqCst),
            1,
            "the exporter's own panic must not re-trigger the reporting hook"
        );
    }
}
