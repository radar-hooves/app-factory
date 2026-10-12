# Agent job lessons

Status: **built 13/10/2026** (replaces the 30/09/2026 `report_outcome`/`retry_unsettled`
design of radar-hooves/godswood#840). Consumer: radar-hooves/godswood#876, on behalf
of every app that runs a persona job (`docs/design/agent-jobs.md`).

## The need

A job's learning loop must not depend on the model choosing to look its lessons up.
Measured on godswood, 11/10/2026: 32 of 92 readings cited any lesson, and a reading
with core-memory in hand made no core-memory call at all, then repeated the mistake an
approved lesson covers. The loop is core-memory's `lesson` tool (`load`, `report`,
`stats`); this slice drives both ends of it from the app, so the model's only part is
naming which lessons it applied.

## Shape

```
jobs.start(lessons=Lessons(domain, situation, propose))
  └─ lesson load ──► brief appended to the job's system prompt; ids saved on the job row
                     (core-memory unreachable: the job starts without lessons, warned)
person accepts / corrects
  └─ report_outcome(db, job_id, accepted, attempts, corrections)   one INSERT, caller's transaction
supervise() sweep, every 60s
  └─ retry_unsettled ──► lesson report (run_ref = job id)           lease, retry, alert
```

**`Lessons(domain, situation, propose=True)`**, passed to `jobs.start`. `domain` is
core-memory's domain for this kind of job (`godswood/fat-controller`). `situation` is up
to 8 context keys, general to specific; the run is filed under the last. A key is an
opaque string to this slice and to core-memory, so an existing store needs **no
mapping**: godswood's lessons stored under `bank_statement`, `utility_bill` and `filing`
load as they stand with `situation=["reading", "bank_statement"]`. The `doc:` form in
core-memory's tool description is an example, not a requirement. The declaration, plus the
ids loaded, is persisted on `agent_jobs.lessons`, so a resumed run on another worker
reports the same loop.

**Load before the run.** `lessons.load` calls `lesson load` over a freshly vended
bearer (20 s bound) and `start` appends the returned brief to `append_system_prompt`.
It fails open: a job that cannot get its lessons runs without them and is reported as
having none, which is exactly what `lesson stats` needs to compare. `start` also adds
`lessons_used` to the job's `json_schema`, so a schema with `additionalProperties:
False` cannot refuse the key the brief asks for. `lessons.cited(job)` reads it back,
keeping only values shaped like a belief id (`[0-9a-f]{32}`): only ids and a person's
corrections leave the app, never a job's content.

**Bounding the load.** `Lessons(focus="", limit=None, max_chars=None)` are passed to
`lesson load` for a job that knows its specifics before it starts (godswood's readings
load 75 lessons, about 41,000 characters, into every prompt, covering five banks'
layouts for a statement from one bank). `focus` is free text: lessons sharing a whole
word with it rank first, then the more specific layer, then confidence. `limit` caps
the count, `max_chars` caps the brief's lesson lines as a ranked prefix. Each is sent
only when set, so unset is the unbounded load; `limit` and `max_chars` below 1 and a
focus over 500 characters are refused at the declaration. core-memory answers `total`
and `omitted`, and `agent_jobs.lessons` records them beside the loaded ids (no column:
the field is JSON, and an older core-memory that reports neither leaves them out). A
core-memory that refuses the bound arguments (a server older than its `focus`/`limit`/
`max_chars` change) is retried once unbounded, warned, never failed. `load` returns a
`Loaded(brief, ids, total, omitted)`.

**`report_outcome(db, job_id, *, accepted, attempts=1, corrections=None, contradicts=None)`**, the one call
an app makes when a person takes the result (`accepted=True`) or corrects it. It
snapshots the job's loaded and cited ids, model (`job.model`, else the persona),
seconds (the job's own run, not the review wait) and the corrections, and inserts them
in the CALLER'S OWN session inside a SAVEPOINT (`insert_lesson_report_if_absent`): a
conflict, first write wins, rolls back only this insert. No network call ever happens on
an app's request path. A no-op when the deployment names no `core_memory_url` or the job
declared no `lessons`. It files a report even when the job cited nothing, since a run
without lessons is what `stats` sets the others against. A correction is `{statement,
key?}`, short and testable, `key` one of the job's situation keys, validated at the
call (statement 1 to 500 characters, at most 20, key in the situation): a malformed
one is the caller's bug, not a refusal found days later in the sweep.

`contradicts` is the ids among the job's cited lessons that the correction showed wrong
(`agent_job_lesson_reports.contradicts`, delivered as `lesson report`'s `contradicts`
only when non-empty). core-memory blames only those: a corrected report without it moves
no posterior, which is the common case and valid. Refused at the call, as core-memory
would at delivery, on an accepted report or an id the job did not cite (ids are
lowercased and deduped). Unlike corrections it survives `propose=False`: it names
lessons, never the person's words.

**`propose=False`** is the per-job gate on proposing. The job still loads lessons and
reports its outcome and citations, but `report_outcome` drops its corrections, so
nothing a person typed about it reaches core-memory's proposal queue. For a job whose
pages can carry what must not enter a free-text channel other sessions read (godswood's
catch-all `general_document` reading).

**`retry_unsettled(db_session_factory, settings, stopping)`** is the ONLY thing that
reports to core-memory, run from `jobs.supervise()`'s 60 s sweep and checking
`stopping` between rows. Each tick it claims up to 5 unsettled rows
(`AgentJobLessonReport.claimed_until`, a lease, `SELECT ... FOR UPDATE`) and sends one
`lesson report` each, inside `asyncio.timeout(90)`. `settle_lesson_report` requires the
caller's own claim token still match, so a write from a lease since reclaimed lands
nowhere. The lease is left to expire on a fault, so its 5 minutes is the retry backoff.

**Exactly once, now.** `lesson report` is idempotent on `run_ref`, which is the job id,
so a response lost after core-memory committed is retried and counted once. The
at-least-once caveat of the former decision/outcome pair is gone.

**Classified by WHEN, not by exception type.** A real fastmcp client wraps connection
refused, a DNS failure or an init timeout as a bare `RuntimeError`, and a read timeout
as `MCPError`: naming exception types misses both. So anything raised while the call is
in flight is TRANSIENT, including a `ToolError` matching FastMCP's own tool-call wrapper
shape (`^Error calling tool '[^']*'(: .*)?$`) or one of its two literal actionable
messages. A `ToolError` carrying neither is core-memory's own refusal, settled
`refused`. A report unsettled past 14 days is abandoned the same way.

**One alert for the whole pipeline's health**, `agent-lessons:failing` (`api/alerts`,
upserted by key), raised before settling on a refusal, on abandonment, on a transient
fault stale for over a day, and on a `core_memory_url` set with no
`core_memory_credential`. Never re-raised UNCHANGED, since `raise_alert` marks it unread
and that would undo an operator's dismissal every sweep. Cleared once a whole sweep
settles with no failures, never by one row's success mid-sweep.

**The credential is a setting, with no default.** `AgentSettings.core_memory_credential`
names the broker credential `vend_envelope` mints core-memory's bearer from; empty, like
`core_memory_url`.

## Taking it

Migration `c8d5e1f2a3b4` adds `agent_jobs.lessons` and reshapes
`agent_job_lesson_reports` (situation, accepted, loaded, attempts, seconds, model,
corrections in place of context key, result and decision id); an unsettled row is
converted to a one-key situation, not dropped. An app repoints its `down_revision`.
`jobs.start(lessons=...)` replaces the persona's own retrieval, so the persona's
`CLAUDE.md` drops the old "retrieve what this deployment believes" paragraph; the
brief tells it to list the ids it applied in `lessons_used`, and nothing else is asked
of it. `report_outcome` loses `domain_name`, `context_key` and `result`, which the job
already carries.
