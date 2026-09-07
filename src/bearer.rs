//! The bearer, and the HTTP client that carries it.
//!
//! `OTEL_EXPORTER_OTLP_HEADERS_HELPER` names a command printing a JSON object of
//! header name to header value — Claude Code's `headersHelper` contract, which
//! `signet headers` already satisfies. It runs once per exporter — at init, at a
//! swap, at a probe: the credential is a static bearer with no expiry, so a
//! rotated one is picked up at the next launch and there is no refresh loop.
//! Nothing here ever logs a header value, the helper's stdout, or anything
//! derived from either — `Debug` included.

use std::collections::HashMap;
use std::fmt;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use opentelemetry_http::{Bytes, HttpClient, HttpError, Request, Response};

/// Parse a helper's stdout. A JSON object of strings is headers; anything else —
/// a bare string, empty output, invalid JSON, a non-string value — is nothing.
pub(crate) fn parse_headers(stdout: &str) -> Option<HashMap<String, String>> {
    let object = serde_json::from_str::<serde_json::Value>(stdout).ok()?;
    let object = object.as_object()?;
    let mut headers = HashMap::with_capacity(object.len());
    for (name, value) in object {
        headers.insert(name.clone(), value.as_str()?.to_owned());
    }
    Some(headers)
}

/// Run the helper under `sh -c`, bounded. The error is a fixed phrase naming the
/// condition — never the command's output, which carries the credential.
pub(crate) fn run_helper(
    command: &str,
    timeout: Duration,
) -> Result<HashMap<String, String>, &'static str> {
    let mut child = Command::new("sh")
        .arg("-c")
        .arg(command)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "the header helper could not be started")?;

    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) => return Err("the header helper exited non-zero"),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            Ok(None) => {
                let _ = child.kill();
                return Err("the header helper timed out");
            }
            Err(_) => return Err("the header helper could not be waited on"),
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|_| "the header helper produced no readable output")?;
    let stdout =
        String::from_utf8(output.stdout).map_err(|_| "the header helper printed non-UTF-8")?;
    parse_headers(&stdout).ok_or("the header helper did not print a JSON object of headers")
}

/// A blocking reqwest client that stamps the helper's headers onto every export
/// last, so they win over any static `OTEL_EXPORTER_OTLP_HEADERS` the SDK applies
/// from the environment. Built here, on the caller's thread at init.
pub(crate) struct HeaderClient {
    inner: reqwest::blocking::Client,
    headers: Vec<(http::HeaderName, http::HeaderValue)>,
}

impl HeaderClient {
    pub(crate) fn new(timeout: Duration, headers: &HashMap<String, String>) -> Option<Self> {
        let headers = headers
            .iter()
            .filter_map(|(name, value)| {
                let name = http::HeaderName::try_from(name.as_str()).ok()?;
                let mut value = http::HeaderValue::try_from(value.as_str()).ok()?;
                value.set_sensitive(true);
                Some((name, value))
            })
            .collect();
        let inner = reqwest::blocking::Client::builder()
            .timeout(timeout)
            .build()
            .ok()?;
        Some(Self { inner, headers })
    }

    /// One blocking POST of an OTLP protobuf body, stamped with the same headers
    /// an export carries. This is [`crate::probe`]'s whole transport: a probe that
    /// passes is evidence about the client the exporters actually use, not about
    /// a second HTTP path built beside it.
    pub(crate) fn post(&self, url: &str, body: Vec<u8>) -> reqwest::Result<reqwest::StatusCode> {
        let mut request = self
            .inner
            .post(url)
            .header(http::header::CONTENT_TYPE, "application/x-protobuf");
        for (name, value) in &self.headers {
            request = request.header(name.clone(), value.clone());
        }
        Ok(request.body(body).send()?.status())
    }
}

/// `HttpClient` demands `Debug`; a derived one would print the bearer.
impl fmt::Debug for HeaderClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("HeaderClient")
            .field("headers", &self.headers.len())
            .finish()
    }
}

#[async_trait::async_trait]
impl HttpClient for HeaderClient {
    async fn send_bytes(&self, mut request: Request<Bytes>) -> Result<Response<Bytes>, HttpError> {
        for (name, value) in &self.headers {
            request.headers_mut().insert(name.clone(), value.clone());
        }
        self.inner.send_bytes(request).await
    }
}

/// The transport timeout, from the signal-specific variable then the general one,
/// in milliseconds. The OTLP default is 10 s.
pub(crate) fn timeout(signal_variable: &str) -> Duration {
    [signal_variable, "OTEL_EXPORTER_OTLP_TIMEOUT"]
        .iter()
        .find_map(|name| std::env::var(name).ok()?.trim().parse::<u64>().ok())
        .map_or(Duration::from_secs(10), Duration::from_millis)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_json_object_is_headers() {
        let headers = parse_headers(r#"{"Authorization":"Bearer test","X-Scope":"apps"}"#)
            .expect("an object parses");
        assert_eq!(headers.len(), 2);
        assert_eq!(headers.get("X-Scope").map(String::as_str), Some("apps"));
    }

    #[test]
    fn anything_that_is_not_an_object_of_strings_is_nothing() {
        assert!(parse_headers(r#""Bearer test""#).is_none(), "a bare string");
        assert!(parse_headers("").is_none(), "empty output");
        assert!(parse_headers("not json at all").is_none(), "invalid JSON");
        assert!(parse_headers("[1, 2]").is_none(), "an array");
        assert!(
            parse_headers(r#"{"Authorization":7}"#).is_none(),
            "a number"
        );
    }

    #[test]
    fn a_helper_that_prints_an_object_yields_headers() {
        let headers = run_helper(
            r#"printf '{"Authorization":"Bearer test"}'"#,
            Duration::from_secs(10),
        )
        .expect("the helper succeeds");
        assert_eq!(headers.len(), 1);
    }

    #[test]
    fn a_failing_or_silent_helper_names_its_condition() {
        for (command, expected) in [
            ("exit 3", "the header helper exited non-zero"),
            (
                "printf 'not json'",
                "the header helper did not print a JSON object of headers",
            ),
            (
                "printf ''",
                "the header helper did not print a JSON object of headers",
            ),
        ] {
            let error = run_helper(command, Duration::from_secs(10)).unwrap_err();
            assert_eq!(error, expected);
        }
    }

    #[test]
    fn a_hanging_helper_is_killed_at_the_deadline() {
        let started = Instant::now();
        let error = run_helper("sleep 30", Duration::from_millis(200)).unwrap_err();
        assert_eq!(error, "the header helper timed out");
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn debug_never_prints_a_header_value() {
        crate::ensure_crypto_provider();
        let client = HeaderClient::new(
            Duration::from_secs(1),
            &HashMap::from([("Authorization".to_owned(), "Bearer hunter2".to_owned())]),
        )
        .expect("a client builds");
        let rendered = format!("{client:?}");
        assert!(!rendered.contains("hunter2"), "{rendered}");
    }
}
