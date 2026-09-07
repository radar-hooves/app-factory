//! Proving a collector answers, before an application saves the endpoint.
//!
//! One OTLP/HTTP protobuf `ExportLogsServiceRequest` carrying a single INFO
//! record goes to `<endpoint>/v1/logs` through the same header client the
//! exporters use, so a probe that passes is evidence the export will. The
//! outcome is a class, never a message: `reqwest`'s error `Display` appends the
//! full URL, so nothing from it reaches [`ProbeError`].

use std::error::Error;
use std::fmt;
use std::io;
use std::time::{SystemTime, UNIX_EPOCH};

use opentelemetry_proto::tonic::collector::logs::v1::ExportLogsServiceRequest;
use opentelemetry_proto::tonic::common::v1::{AnyValue, KeyValue, any_value};
use opentelemetry_proto::tonic::logs::v1::{LogRecord, ResourceLogs, ScopeLogs, SeverityNumber};
use opentelemetry_proto::tonic::resource::v1::Resource;
use opentelemetry_semantic_conventions::resource::SERVICE_NAME;
use prost::Message;

use crate::{Exporter, bearer, ensure_crypto_provider, headers_for, signal_url};

/// How deep to look for rustls' own error before giving up and calling it a
/// connect failure: the chain from `reqwest` through hyper to the handshake is
/// three or four links, and a bound keeps a cyclic chain from spinning.
const CHAIN_DEPTH: usize = 8;

/// Why a probe did not succeed. Each variant names a transport class or an HTTP
/// status and nothing else: no URL, no header value, no response body.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProbeError {
    /// The header helper did not produce headers, so nothing was sent.
    Helper,
    /// Nothing accepted a connection at the endpoint.
    Connect,
    /// The TLS handshake failed.
    Tls,
    /// The collector did not answer inside the OTLP timeout.
    Timeout,
    /// The request could not be sent for any other reason.
    Transport,
    /// The collector answered, and refused.
    Status(u16),
}

impl fmt::Display for ProbeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Helper => f.write_str("the header helper failed"),
            Self::Connect => f.write_str("nothing answered at the endpoint"),
            Self::Tls => f.write_str("the TLS handshake failed"),
            Self::Timeout => f.write_str("the collector did not answer in time"),
            Self::Transport => f.write_str("the request could not be sent"),
            Self::Status(status) => write!(f, "the collector answered {status}"),
        }
    }
}

impl Error for ProbeError {}

/// Send one log record to `exporter` and report whether it was accepted. Any 2xx
/// is `Ok`; everything else is a class a Settings pane can put beside the field.
///
/// It reads no settings and stores nothing: the caller owns the value being
/// tested, whether or not it is the one currently installed.
///
/// Call it from a plain thread, never inside a Tokio task: it builds the same
/// blocking `reqwest` client the exporters use, which panics in an async context.
pub fn probe(exporter: &Exporter) -> Result<(), ProbeError> {
    ensure_crypto_provider();
    let headers = headers_for(exporter).map_err(|_| ProbeError::Helper)?;
    let timeout = bearer::timeout("OTEL_EXPORTER_OTLP_LOGS_TIMEOUT");
    let client = bearer::HeaderClient::new(timeout, &headers).ok_or(ProbeError::Transport)?;
    let url = signal_url(&exporter.endpoint, "/v1/logs");
    let status = client
        .post(&url, request().encode_to_vec())
        .map_err(classify)?;
    if status.is_success() {
        Ok(())
    } else {
        Err(ProbeError::Status(status.as_u16()))
    }
}

/// One INFO record under this crate's own `service.name`, so a probe is
/// recognisable in the corpus and carries nothing of the caller's.
fn request() -> ExportLogsServiceRequest {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;
    let text = |value: &str| {
        Some(AnyValue {
            value: Some(any_value::Value::StringValue(value.to_owned())),
        })
    };
    ExportLogsServiceRequest {
        resource_logs: vec![ResourceLogs {
            resource: Some(Resource {
                attributes: vec![KeyValue {
                    key: SERVICE_NAME.to_owned(),
                    value: text(env!("CARGO_PKG_NAME")),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            scope_logs: vec![ScopeLogs {
                log_records: vec![LogRecord {
                    time_unix_nano: now,
                    observed_time_unix_nano: now,
                    severity_number: SeverityNumber::Info as i32,
                    severity_text: "INFO".to_owned(),
                    body: text("telemetry probe"),
                    ..Default::default()
                }],
                ..Default::default()
            }],
            ..Default::default()
        }],
    }
}

/// The class of a failed send. Timeout first, because a handshake that never
/// completes is a timeout; TLS before connect, because `reqwest` reports a failed
/// handshake as a connect error.
fn classify(error: reqwest::Error) -> ProbeError {
    if error.is_timeout() {
        ProbeError::Timeout
    } else if is_tls(&error) {
        ProbeError::Tls
    } else if error.is_connect() {
        ProbeError::Connect
    } else {
        ProbeError::Transport
    }
}

/// Look for rustls' own error in the cause chain. Downcasting, never matching on
/// a message: every message in that chain carries the URL. The handshake failure
/// arrives nested two `io::Error`s deep, and `io::Error::source` returns its
/// payload's source rather than the payload, so the walk steps through `get_ref`
/// wherever there is one.
fn is_tls(error: &reqwest::Error) -> bool {
    let mut cause: Option<&(dyn Error + 'static)> = Some(error);
    for _ in 0..CHAIN_DEPTH {
        let Some(current) = cause else { return false };
        if current.is::<rustls::Error>() {
            return true;
        }
        cause = current
            .downcast_ref::<io::Error>()
            .and_then(io::Error::get_ref)
            .map(|inner| inner as &(dyn Error + 'static))
            .or_else(|| current.source());
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn to(endpoint: String) -> Exporter {
        Exporter {
            endpoint,
            headers_helper: None,
        }
    }

    /// A loopback listener that answers one request with 200, then drains what is
    /// left so the client never sees a reset instead of the response.
    fn accepts_one() -> (u16, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback listener");
        let port = listener.local_addr().expect("its address").port();
        let served = std::thread::spawn(move || {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let mut head = [0u8; 8192];
            let _ = stream.read(&mut head);
            let _ = stream.write_all(b"HTTP/1.1 200 OK\r\ncontent-length: 0\r\n\r\n");
            let _ = stream.flush();
            let _ = io::copy(&mut stream, &mut io::sink());
        });
        (port, served)
    }

    #[test]
    #[serial]
    fn a_collector_that_answers_two_hundred_is_reachable() {
        let (port, served) = accepts_one();
        assert_eq!(probe(&to(format!("http://127.0.0.1:{port}"))), Ok(()));
        served.join().expect("the listener thread");
    }

    #[test]
    #[serial]
    fn a_refused_port_is_a_connect_failure_that_names_no_url() {
        // Port 1 on loopback refuses immediately; nothing leaves the host.
        let error = probe(&to("http://127.0.0.1:1/library".to_owned()))
            .expect_err("port 1 refuses a connection");
        assert_eq!(error, ProbeError::Connect);

        let rendered = format!("{error} {error:?}");
        for forbidden in ["127.0.0.1", "http", "library", "v1/logs"] {
            assert!(!rendered.contains(forbidden), "{forbidden} in {rendered}");
        }
    }

    /// TLS is a class of its own only because rustls' own error is found in the
    /// cause chain; `reqwest` reports a failed handshake as a connect error.
    #[test]
    #[serial]
    fn a_plaintext_listener_behind_https_is_a_tls_failure() {
        let (port, served) = accepts_one();
        let error =
            probe(&to(format!("https://127.0.0.1:{port}"))).expect_err("nothing offers TLS there");
        assert_eq!(error, ProbeError::Tls);
        served.join().expect("the listener thread");
    }

    #[test]
    fn the_record_carries_a_service_name_and_nothing_of_the_callers() {
        let rendered = format!("{:?}", request());
        assert!(rendered.contains("telemetry probe"), "{rendered}");
        assert!(rendered.contains(SERVICE_NAME), "{rendered}");
    }
}
