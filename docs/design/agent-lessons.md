# Agent job lessons

Status: **design, 30/09/2026.** Consumer: radar-hooves/godswood#840, on
behalf of every app that runs a persona job (`docs/design/agent-jobs.md`) —
Milton, Penny, cadmus's models, and a coming Taxpert.

## The need

core-memory carries the learning loop — beliefs, confidence, decisions,
outcomes, calibration, promotion. What it cannot know on its own is the one
moment a human accepts a persona's result as-is or corrects it, because only
the app that showed the person that result sees that moment. This slice is
the standard shape every app's persona job uses to close that loop, so it is
built once, beside `jobs.py`, rather than hand-written per app.

## Shape

**A reserved answer key.** A persona names the belief ids it followed
(`belief_retrieve`) under `lessons_used` in its own structured answer — a
convention, not a schema `json_schema` enforces. `lessons.cited(job)` reads
the key back, lowercased and deduped, keeping only values shaped like a
belief id (`[0-9a-f]{32}`): only ids ever leave the app, never a job's
content.

**`report_outcome(db, job_id, *, domain_name, context_key, result)`**, the one
call an app makes at the moment a person accepts (`result="confirm"`) or
corrects (`result="contradict"`) a job's result — whether that counts as
"unchanged" is a review-form and domain question the app has already
answered; this slice never compares values itself. It validates `result` and
the key lengths, snapshots the job's cited ids NOW (never re-read at
delivery — a job resumed and re-answered after filing must not change what
an already-filed verdict cited), and inserts the intent in the CALLER'S OWN
session, inside a SAVEPOINT (`insert_lesson_report_if_absent`) so a
conflict — the PK, first-write-wins, or an FK if the job somehow vanished —
rolls back only this insert, never the caller's own transaction. No network
call, no vend, ever happens on an app's request path; a no-op when this
deployment names no `core_memory_url` (`AgentSettings`, empty by default —
"build nothing central") or the job cited nothing. First write wins: a
correction filed after an earlier confirm for the same job is silently
dropped, not merged.

**`retry_unsettled(db_session_factory, settings, stopping)`** is the ONLY
thing that ever calls core-memory, run from `jobs.supervise()`'s existing 60s
sweep (`docs/design/agent-jobs.md` §Any worker) — never a poller of its own,
and it checks `stopping` between rows so a shutdown does not wait out a
whole batch. Each tick it claims up to 5 unsettled rows
(`AgentJobLessonReport.claimed_until`, a lease — `SELECT ... FOR UPDATE`
under the row's own unclaimed condition, `jobs_models._locked`'s pattern) and
attempts delivery over ONE vended bearer and ONE `Client`: `decision_record`
(citing the snapshotted ids, `payload={"job_id": job_id}` so a duplicate can
be traced) then `outcome_record`, the whole attempt inside
`asyncio.timeout(90)` and the client itself bounded (`timeout=30,
init_timeout=15`). Only the lease's holder ever reaches core-memory; every
other caller — a second worker's sweep, godswood runs five — returns at
once. The lease is left to expire on a fault rather than cleared, so its 5
minutes (≥3× the bound) is also that report's retry backoff, and
`set_lesson_decision`/`settle_lesson_report` both require the caller's own
claim token still matches `claimed_until` before writing, so a write from a
lease that has since been reclaimed by someone else lands nowhere.

**Classified by WHEN, not by exception type.** A real fastmcp client (3.4.2,
4.0.10) wraps connection refused, a DNS failure or an init timeout as a bare
`RuntimeError`, and a read timeout on 4.0.10 arrives as `httpx.ReadTimeout` —
naming exception types misses both. So anything raised while a call is in
flight, whatever its type, is TRANSIENT — including a `ToolError` whose
message is FastMCP's own masked generic shape (`"Error calling tool 'x'"`,
what `mask_error_details` turns ANY unhandled server exception into), since
that shape makes a genuine refusal and an unrelated bug identical on the
wire. A `ToolError` carrying real detail is core-memory's own refusal,
settled `refused`. Only a failure AFTER a successful response — this
slice's own reading of it, e.g. `decision["id"]` missing — settles as
unexpected, logged at ERROR: a fault this slice does not recognise,
surfaced rather than retried for two weeks on a guess. A report still
unsettled past 14 days is abandoned the same way — claimed, then settled
`refused`.

**One alert for the whole pipeline's health**, `agent-lessons:failing`
(`api/alerts`, upserted by key so there is never more than one), raised
BEFORE settling on a refusal or an unexpected fault, on abandonment, on a
transient fault stale for over a day, and on a `core_memory_url` set with no
`core_memory_credential` — the one deployment-level misconfiguration this
slice can recognise on its own, checked before ever attempting delivery so
it alerts once rather than looping uselessly for 14 days. Cleared on the
next successful delivery.

**The credential is a setting, with no default.**
`AgentSettings.core_memory_credential` names the broker credential
`vend_envelope` mints core-memory's bearer from; empty, like
`core_memory_url`, since no name is derivable the way
`gateway_key_credential`'s fallback (`{{ project_name }}-gateway`) is —
godswood sets it explicitly to its own broker's name.

## At-least-once, honestly

Claiming and fencing stop two callers of THIS app's own slice from both
telling core-memory the same thing. They do not close every gap: a response
lost after core-memory has already committed a call still reads as a
transport fault here, and the retry that follows double-counts it on
core-memory's own side, until an idempotency key there (core-memory#27)
closes it. This slice's own claim is at-least-once, not exactly-once, and
that is the whole of what is honest to say about it.

## Persona wording

Every persona's own `CLAUDE.md` — app-owned, never rendered by this template
— carries this paragraph verbatim (`platform/canonical-app-shape.md`
§Sameness extends to prose):

> Before you work, retrieve what this deployment already believes about the
> task ahead of you (`belief_retrieve` on your own domain and context). As you
> answer, if a lesson changed what you did, name what would have got it right
> the first time. Answer with `lessons_used`: the JSON array of ids of the
> beliefs you actually followed, `[]` when you followed none.

## Sequence

Factory: this slice, its migration, `test_agent_lessons.py`. Tag, once
merged (never cut from a worktree branch). Every other app takes it on its
next copier update; nothing changes until a persona of theirs starts citing
lessons.
