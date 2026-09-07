//! The span this crate's own outbound HTTP client opens.
//!
//! `reqwest-tracing`'s `DefaultSpanBackend` records `error.message` and
//! `error.cause_chain` on a failed request, and both are built from a
//! `reqwest::Error` whose `Display` appends `" for url ({url})"` and whose
//! `Debug` carries a `url` field — the full URL, path and query. Because this
//! target is force-allowed past the caller's allow-list, that would export a
//! search term or a query-string credential off the device with no allow-list
//! control. So the household backend records the method, the host and the
//! status, and nothing that can carry a path, a query or an error string.

use reqwest::Request;
use reqwest_middleware::{Error, Result};
use reqwest_tracing::ReqwestOtelSpanBackend;
use tracing::{Span, field::Empty, info_span};

/// The `target` of the span below. Force-allowed by `allow::allowed`, so it is
/// this crate's own constant rather than a claim about another crate's layout.
pub(crate) const TARGET: &str = "telemetry::client";

pub(crate) struct HouseholdSpanBackend;

impl ReqwestOtelSpanBackend for HouseholdSpanBackend {
    fn on_request_start(request: &Request, _: &mut http::Extensions) -> Span {
        let url = request.url();
        info_span!(
            target: TARGET,
            "HTTP request",
            otel.kind = "client",
            otel.name = %request.method(),
            otel.status_code = Empty,
            http.request.method = %request.method(),
            server.address = %url.host_str().unwrap_or_default(),
            server.port = url.port_or_known_default().unwrap_or_default() as i64,
            http.response.status_code = Empty,
        )
    }

    fn on_request_end(span: &Span, outcome: &Result<reqwest::Response>, _: &mut http::Extensions) {
        match outcome {
            Ok(response) => {
                span.record("http.response.status_code", response.status().as_u16());
                if response.status().is_server_error() {
                    span.record("otel.status_code", "ERROR");
                }
            }
            Err(error) => {
                span.record("otel.status_code", "ERROR");
                // Deliberately nothing from the error itself: see the module doc.
                if let Error::Reqwest(error) = error
                    && let Some(status) = error.status()
                {
                    span.record("http.response.status_code", status.as_u16());
                }
            }
        }
    }
}
