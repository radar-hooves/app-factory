//! The one predicate that decides what leaves the device.
//!
//! An event or span reaches the OTLP layers only when its `target` is on the
//! application's allow-list. That is what keeps listening history and dictation
//! local, and what stops the exporter's own internal logs re-exporting in a loop.

use tracing::Metadata;
use tracing::level_filters::LevelFilter;
use tracing_subscriber::filter::{FilterFn, filter_fn};

/// Spans this crate's own outbound HTTP client opens carry no application data —
/// they are the client half of a trace the household wants end to end — so they
/// are always allowed. `reqwest-tracing` expands `reqwest_otel_span!` inside its
/// own crate, so the target is `reqwest_tracing::…`.
const CLIENT_TARGET_PREFIX: &str = "reqwest_tracing";

/// True when `target` is exactly an allow-list entry, or a module beneath one.
pub(crate) fn allowed(target: &str, allow: &[&str]) -> bool {
    target.starts_with(CLIENT_TARGET_PREFIX)
        || allow.iter().any(|entry| {
            target == *entry
                || target
                    .strip_prefix(*entry)
                    .is_some_and(|rest| rest.starts_with("::"))
        })
}

/// The filter both OTLP layers share: the allow-list, with a level floor of INFO.
pub(crate) fn otlp_filter(
    allow: &'static [&'static str],
) -> FilterFn<impl Fn(&Metadata<'_>) -> bool> {
    filter_fn(move |meta: &Metadata<'_>| {
        *meta.level() <= tracing::Level::INFO && allowed(meta.target(), allow)
    })
    .with_max_level_hint(LevelFilter::INFO)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALLOW: &[&str] = &["bragi", "thoth::playback"];

    #[test]
    fn exact_match_is_allowed() {
        assert!(allowed("bragi", ALLOW));
        assert!(allowed("thoth::playback", ALLOW));
    }

    #[test]
    fn module_beneath_an_entry_is_allowed() {
        assert!(allowed("bragi::library::scan", ALLOW));
        assert!(allowed("thoth::playback::queue", ALLOW));
    }

    #[test]
    fn anything_else_is_denied() {
        assert!(!allowed("thoth", ALLOW));
        assert!(!allowed("thoth::dictation", ALLOW));
        assert!(!allowed("bragi_private", ALLOW), "a prefix is not a module");
        assert!(!allowed("opentelemetry_sdk", ALLOW), "no export loop");
        assert!(!allowed("", ALLOW));
    }

    #[test]
    fn the_crates_own_client_spans_are_always_allowed() {
        assert!(allowed("reqwest_tracing::reqwest_otel_span_builder", &[]));
    }

    /// The constant above is a claim about another crate; this checks it against
    /// the span `reqwest-tracing` actually builds, with no network involved.
    #[test]
    fn the_client_target_constant_matches_reqwest_tracing() {
        use reqwest_tracing::{DefaultSpanBackend, ReqwestOtelSpanBackend};
        crate::ensure_crypto_provider();
        let request = reqwest::Client::new()
            .get("http://127.0.0.1:1/")
            .build()
            .expect("a request that is never sent");
        // A span only carries metadata while a subscriber is active.
        let target = tracing::subscriber::with_default(tracing_subscriber::registry(), || {
            DefaultSpanBackend::on_request_start(&request, &mut Default::default())
                .metadata()
                .map(|m| m.target().to_owned())
                .unwrap_or_default()
        });
        assert!(
            allowed(&target, &[]),
            "reqwest-tracing now uses target {target:?}"
        );
    }
}
