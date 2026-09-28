//! One span per Tauri IPC command, on this plugin's own allow-listed target.
//!
//! [`traced`] wraps a command's whole body as a single span carrying the
//! command name (a compile-time `&'static str` the caller chooses, never
//! derived from an argument) and an `outcome` of `ok` or `err`, recorded once
//! the wrapped future resolves. The span's own start and close timestamps are
//! its duration; nothing here computes or records one directly. One shared
//! implementation here replaces a consumer hand-rolling its own.
//!
//! Deliberately NOT Tauri's own `tracing` cargo feature: as of tauri 2.11.5,
//! that feature's `ipc::request` span records the WHOLE request body as a
//! `request` field (`src/ipc/protocol.rs`, `span.record("request",
//! serde_json::to_string(...))`) and its `ipc::request::response` span records
//! the whole response or error too — full argument and response capture by
//! default, at TRACE level, which is the opposite of what this module gives a
//! consumer. `traced` never receives a command's parameters — only the future
//! the command's body already is — so there is structurally nothing here that
//! could carry a track, artist, playlist, search term or dictation string for
//! the great majority of commands, which use it as-is. A curated few build
//! their own span with [`traced_with_span`] instead, adding exactly the
//! fields that explain the work.
//!
//! A Tauri command that must stay `fn`, never `async fn` — Tauri's own setup
//! hook, a tray-menu builder, anything else that cannot await — gets the
//! identical span from [`traced_sync`]/[`traced_with_span_sync`]: same
//! target, same `command`/`outcome` fields, same closure with no access to
//! the arguments that produced it.
//!
//! [`COMMAND_SPAN_TARGET`] must reach the allow-list an app hands to
//! [`crate::init`]'s `allow` argument — `tracing`'s span macros place the
//! `target` field in a `static` initializer, so it must be a compile-time
//! constant, and cannot be threaded through as a runtime parameter of
//! `traced` itself; [`crate::init`] adds it automatically so an app's `allow`
//! only ever needs its OWN extra targets.

use tracing::Instrument;

/// The one `tracing` target every command span this module opens is emitted
/// on. An app that also uses [`traced_with_span`] for its own curated spans
/// may reuse this target too, or name its own — either way it must be on the
/// allow-list [`crate::init`] passes to `telemetry::init` (done automatically
/// for this one; not for an app's own).
pub const COMMAND_SPAN_TARGET: &str = "tauri_plugin_telemetry::commands";

/// Wrap a command's body in one span carrying only `command` and `outcome`.
///
/// `fut` is the command's own body, already built by the caller — this
/// function has no access to whatever arguments produced it.
pub async fn traced<F, T, E>(command: &'static str, fut: F) -> Result<T, E>
where
    F: std::future::Future<Output = Result<T, E>>,
{
    traced_with_span(
        tracing::info_span!(
            target: COMMAND_SPAN_TARGET,
            "ipc_command",
            command,
            outcome = tracing::field::Empty,
        ),
        fut,
    )
    .await
}

/// [`traced`]'s own machinery, opened up for a caller that needs its span to
/// carry more than `command` — a curated argument that explains the work,
/// built into `span` by the caller before this function ever sees it. Records
/// `outcome` exactly as `traced` does, so a call site gains fields without
/// re-implementing the outcome bookkeeping. Target-agnostic: this function
/// never constructs a span itself, so a caller may build one on any target,
/// as long as that target is on the allow-list `init` was given.
///
/// The caller's span must declare `outcome = tracing::field::Empty` itself
/// (see [`traced`]'s own construction) — this function only records into it.
pub async fn traced_with_span<F, T, E>(span: tracing::Span, fut: F) -> Result<T, E>
where
    F: std::future::Future<Output = Result<T, E>>,
{
    let result = fut.instrument(span.clone()).await;
    span.record("outcome", if result.is_ok() { "ok" } else { "err" });
    result
}

/// [`traced`]'s own shape for a command that cannot be `async` — Tauri's
/// setup hook and the tray-menu builder call synchronously, and no future
/// exists there to `.instrument`. Same target, same `command`/`outcome`
/// fields, same "no argument capture" guarantee: `f` is a plain closure with
/// no access to whatever arguments produced it, exactly as `fut` gives
/// `traced` none.
pub fn traced_sync<F, T, E>(command: &'static str, f: F) -> Result<T, E>
where
    F: FnOnce() -> Result<T, E>,
{
    traced_with_span_sync(
        tracing::info_span!(
            target: COMMAND_SPAN_TARGET,
            "ipc_command",
            command,
            outcome = tracing::field::Empty,
        ),
        f,
    )
}

/// [`traced_with_span`]'s sync counterpart — [`Span::in_scope`] rather than
/// `.instrument()`, since there is no future to carry the span across await
/// points; the closure runs to completion inline, on the calling thread.
///
/// [`Span::in_scope`]: tracing::Span::in_scope
pub fn traced_with_span_sync<F, T, E>(span: tracing::Span, f: F) -> Result<T, E>
where
    F: FnOnce() -> Result<T, E>,
{
    let result = span.in_scope(f);
    span.record("outcome", if result.is_ok() { "ok" } else { "err" });
    result
}

/// [`traced_sync`] for a command that cannot fail: the body returns `T`
/// itself, and the span's `outcome` is always `ok`.
pub fn traced_sync_value<F, T>(command: &'static str, f: F) -> T
where
    F: FnOnce() -> T,
{
    match traced_sync(command, || Ok::<T, std::convert::Infallible>(f())) {
        Ok(value) => value,
        Err(never) => match never {},
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use tracing::field::{Field, Visit};
    use tracing::span::{Attributes, Id};
    use tracing_subscriber::layer::{Context, Layer, SubscriberExt};
    use tracing_subscriber::registry;

    use super::*;

    /// Every span opened, as its target plus the rendered value of each field
    /// recorded on it (both at creation and via a later `record`).
    #[derive(Default)]
    struct Captured(Arc<Mutex<std::collections::HashMap<Id, (&'static str, String)>>>);

    struct Recorder(String);

    impl Visit for Recorder {
        fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
            self.0.push_str(&format!(" {}={:?}", field.name(), value));
        }
    }

    impl<S: tracing::Subscriber + for<'a> tracing_subscriber::registry::LookupSpan<'a>> Layer<S>
        for Captured
    {
        fn on_new_span(&self, attrs: &Attributes<'_>, id: &Id, _: Context<'_, S>) {
            let mut recorder = Recorder(String::new());
            attrs.record(&mut recorder);
            self.0
                .lock()
                .unwrap()
                .insert(id.clone(), (attrs.metadata().target(), recorder.0));
        }

        fn on_record(&self, id: &Id, values: &tracing::span::Record<'_>, _: Context<'_, S>) {
            let mut spans = self.0.lock().unwrap();
            if let Some((_, fields)) = spans.get_mut(id) {
                let mut recorder = Recorder(String::new());
                values.record(&mut recorder);
                fields.push_str(&recorder.0);
            }
        }
    }

    /// Run `f` under a local subscriber that only `Captured` sees, returning
    /// what it captured. `traced` uses `Instrument`, which carries the span
    /// across `.await` points via the ambient dispatcher rather than a held
    /// guard, so a plain `set_default` for the call's duration is enough.
    async fn captured_spans<F: std::future::Future>(
        f: F,
    ) -> (F::Output, Vec<(&'static str, String)>) {
        let captured = Captured::default();
        let spans = captured.0.clone();
        let dispatch = tracing::Dispatch::new(registry().with(captured));
        let output = {
            let _guard = tracing::dispatcher::set_default(&dispatch);
            f.await
        };
        let spans = spans.lock().unwrap().values().cloned().collect();
        (output, spans)
    }

    /// [`captured_spans`]'s sync counterpart, for `traced_sync`/
    /// `traced_with_span_sync` — no future, so no dispatcher needs to
    /// outlive an `.await`; `f` runs to completion before the guard drops.
    fn captured_spans_sync<F: FnOnce() -> R, R>(f: F) -> (R, Vec<(&'static str, String)>) {
        let captured = Captured::default();
        let spans = captured.0.clone();
        let dispatch = tracing::Dispatch::new(registry().with(captured));
        let output = {
            let _guard = tracing::dispatcher::set_default(&dispatch);
            f()
        };
        let spans = spans.lock().unwrap().values().cloned().collect();
        (output, spans)
    }

    #[tokio::test]
    async fn a_successful_command_carries_the_name_and_an_ok_outcome() {
        let (result, spans) =
            captured_spans(traced("telemetry_get", async { Ok::<_, &'static str>(42) })).await;

        result.unwrap();
        assert_eq!(spans.len(), 1, "one span per command: {spans:?}");
        let (target, fields) = &spans[0];
        assert_eq!(*target, COMMAND_SPAN_TARGET);
        assert!(fields.contains("command=\"telemetry_get\""), "{fields}");
        assert!(fields.contains("outcome=\"ok\""), "{fields}");
    }

    #[tokio::test]
    async fn a_failed_command_carries_an_err_outcome_and_no_error_content() {
        let (result, spans) = captured_spans(traced("telemetry_set", async {
            Err::<(), _>("wrong password for user secret@example.com".to_string())
        }))
        .await;

        result.unwrap_err();
        let (_, fields) = &spans[0];
        assert!(fields.contains("outcome=\"err\""), "{fields}");
        assert!(
            !fields.contains("secret@example.com"),
            "the error's content leaked into the span: {fields}"
        );
    }

    /// `traced` is generic over the future alone; a caller that closes over a
    /// track title, a search term, dictation or a credential has no field on
    /// this function through which it could reach the span. This test exists
    /// to document that guarantee, not to exercise new behaviour.
    #[tokio::test]
    async fn traced_never_sees_the_wrapped_futures_captured_state() {
        let dictation = "a listening-history or dictation value".to_string();
        let (result, spans) = captured_spans(traced("some_command", async move {
            let _ = &dictation;
            Ok::<_, &'static str>(())
        }))
        .await;

        result.unwrap();
        let (_, fields) = &spans[0];
        assert!(!fields.contains("listening-history"), "{fields}");
    }

    /// A curated call site builds its own span with `traced_with_span`, on
    /// whatever target it likes — `traced_with_span` never constructs one
    /// itself, so it carries no target-migration cost for an app already
    /// using it against its own const.
    #[tokio::test]
    async fn traced_with_span_carries_the_callers_curated_field_and_target() {
        const APP_TARGET: &str = "some_app::commands";
        let (result, spans) = captured_spans(async {
            let span = tracing::info_span!(
                target: APP_TARGET,
                "ipc_command",
                command = "search_library",
                outcome = tracing::field::Empty,
                query = "duran duran",
            );
            traced_with_span(span, async { Ok::<_, &'static str>(()) }).await
        })
        .await;

        result.unwrap();
        let (target, fields) = &spans[0];
        assert_eq!(*target, APP_TARGET);
        assert!(fields.contains("outcome=\"ok\""), "{fields}");
        assert!(fields.contains("query=\"duran duran\""), "{fields}");
    }

    /// The same span shape as `traced`'s own test of the same name — target,
    /// `command` field, `outcome="ok"` — proving `traced_sync` gives a
    /// synchronous command what `traced` gives an async one.
    #[test]
    fn a_successful_sync_command_carries_the_name_and_an_ok_outcome() {
        let (result, spans) =
            captured_spans_sync(|| traced_sync("get_config", || Ok::<_, &'static str>(42)));

        result.unwrap();
        assert_eq!(spans.len(), 1, "one span per command: {spans:?}");
        let (target, fields) = &spans[0];
        assert_eq!(*target, COMMAND_SPAN_TARGET);
        assert!(fields.contains("command=\"get_config\""), "{fields}");
        assert!(fields.contains("outcome=\"ok\""), "{fields}");
    }

    #[test]
    fn a_failed_sync_command_carries_an_err_outcome_and_no_error_content() {
        let (result, spans) = captured_spans_sync(|| {
            traced_sync("set_config", || {
                Err::<(), _>("wrong password for user secret@example.com".to_string())
            })
        });

        result.unwrap_err();
        let (_, fields) = &spans[0];
        assert!(fields.contains("outcome=\"err\""), "{fields}");
        assert!(
            !fields.contains("secret@example.com"),
            "the error's content leaked into the span: {fields}"
        );
    }

    /// `traced_sync` is generic over the closure alone; a caller that closes
    /// over a track title, a search term, dictation or a credential has no
    /// field on this function through which it could reach the span. Mirrors
    /// `traced_never_sees_the_wrapped_futures_captured_state`.
    #[test]
    fn traced_sync_never_sees_the_wrapped_closures_captured_state() {
        let dictation = "a listening-history or dictation value".to_string();
        let (result, spans) = captured_spans_sync(|| {
            traced_sync("some_command", || {
                let _ = &dictation;
                Ok::<_, &'static str>(())
            })
        });

        result.unwrap();
        let (_, fields) = &spans[0];
        assert!(!fields.contains("listening-history"), "{fields}");
    }

    /// A curated sync call site builds its own span with
    /// `traced_with_span_sync`, on whatever target it likes — mirrors
    /// `traced_with_span_carries_the_callers_curated_field_and_target`.
    #[test]
    fn traced_with_span_sync_carries_the_callers_curated_field_and_target() {
        const APP_TARGET: &str = "some_app::commands";
        let (result, spans) = captured_spans_sync(|| {
            let span = tracing::info_span!(
                target: APP_TARGET,
                "ipc_command",
                command = "register_shortcut",
                outcome = tracing::field::Empty,
                shortcut = "ctrl+shift+d",
            );
            traced_with_span_sync(span, || Ok::<_, &'static str>(()))
        });

        result.unwrap();
        let (target, fields) = &spans[0];
        assert_eq!(*target, APP_TARGET);
        assert!(fields.contains("outcome=\"ok\""), "{fields}");
        assert!(fields.contains("shortcut=\"ctrl+shift+d\""), "{fields}");
    }

    #[test]
    fn an_infallible_sync_command_returns_its_value_with_an_ok_outcome() {
        let (value, spans) = captured_spans_sync(|| traced_sync_value("list_audio_devices", || 7));

        assert_eq!(value, 7);
        assert_eq!(spans.len(), 1, "one span per command: {spans:?}");
        let (target, fields) = &spans[0];
        assert_eq!(*target, COMMAND_SPAN_TARGET);
        assert!(
            fields.contains("command=\"list_audio_devices\""),
            "{fields}"
        );
        assert!(fields.contains("outcome=\"ok\""), "{fields}");
    }
}
