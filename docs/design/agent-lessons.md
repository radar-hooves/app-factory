# Agent job lessons

Status: **design, 29/09/2026.** Consumer: radar-hooves/godswood#840, on
behalf of every app that runs a persona job (`docs/design/agent-jobs.md`) —
Milton, Penny, cadmus's models, and a coming Taxpert. About 630 lines:
267 in `api/agent/lessons.py`, 112 added to `jobs_models.py` (the report row
and its claim), 89 in the migration, 25 across `jobs.py`/`main.py` to wire the
retry sweep into the existing supervisor, 10 in `config/sections/agent.py`,
the rest this note and its test file (332 lines, two review rounds of fixes).

## The need

core-memory already carries the learning loop — beliefs, confidence,
decisions, outcomes, calibration, promotion ("that's exactly why core-memory
exists", the operator, 29/09). What it cannot know on its own is the one
moment a human accepts a persona's result as-is or corrects it, because only
the app that showed the person that result sees that moment. godswood built
this once, for one document pipeline (`pipeline/lesson_outcomes.py`,
`fc_lesson_outcomes`); the shape it built — cite, then report, resumable,
refusal-final — is exactly what every app's own persona job needs, so it
belongs beside `jobs.py`, not hand-written per app.

## Decision

**Three pieces, all in the existing agent-jobs slice.**

1. **A reserved answer key, not an enforced schema.** A job's `json_schema`
   is the app's own contract with its persona (`docs/design/agent-jobs.md`
   §What answers each need, item 7); this slice does not touch it. What it
   adds is a convention: a persona that followed lessons names their belief
   ids under `lessons_used` in its structured answer, and `lessons.cited(job)`
   reads that key back. An app that never asks for the key gets `[]` and the
   rest of this slice is a no-op for it.
2. **`api/agent/lessons.py::report_outcome()`, the one call an app makes at
   accept-or-correct time.** It takes `domain_name`, `context_key` and
   `result` (`"confirm"` or `"contradict"` — the app's own read of "unchanged"
   vs "corrected", which stays the app's: comparing a filed value against
   what was read is a review-form and domain question, and godswood's own
   tolerant comparator (`lesson_outcomes.py::unchanged`) stays godswood's).
   It reads the job's cited lessons, then tells core-memory `decision_record`
   (citing them) followed by `outcome_record` (the app's `result`).
3. **`AgentJobLessonReport`, one row per job**, the same shape godswood's
   `FcLessonOutcomeModel` proved: `decision_id` set once the decision is
   recorded, `recorded_at` set once the whole report is done. A call repeated
   after a crash resumes from whichever half core-memory does not have yet;
   a call repeated once `recorded_at` is set is a no-op — success or a final
   refusal (`ToolError`: a cited belief unknown or no longer active) alike,
   since core-memory's refusal is all-or-nothing and asking again changes
   nothing.

A network fault is never the caller's to carry (godswood-ec review, 29/09):
`report_outcome` records the intent before it ever calls core-memory, so a
transport error there — never a `ToolError` refusal, which is settled on the
spot — is logged and leaves the report unsettled rather than raised. The
retry is the factory's, not each app's: `lessons.retry_unsettled` rides
`jobs.supervise()`'s own 60s sweep (the one that already reconciles orphaned
jobs), re-attempting every unsettled report the same way a repeated direct
call would — resumed from `decision_id`, never re-recorded — and abandoning
one still unsettled after 14 days with a logged reason rather than retrying
forever.

`jobs.supervise()` runs in every worker, and godswood runs five — so the
sweep and the app's own direct call, or two workers' sweeps, can reach for the
SAME unsettled report at once, and core-memory's `decision_record` takes no
idempotency key of its own to fall back on (second godswood-ec review, 29/09).
`claim_lesson_report` is the fix: a nullable `claimed_until` lease, claimed by
one atomic `SELECT ... FOR UPDATE` under the same WHERE the claim itself
states (unsettled, and not already leased) — the same "block, then re-check
the committed row" pattern `jobs_models._locked` already uses for a job's own
row. Only the winner ever calls core-memory; every loser returns at once, and
`report_outcome`/`retry_unsettled`'s abandon path both claim through the
identical function, so one lease gates every way of touching a report. Left
to expire rather than cleared on a transport fault, the 5-minute lease is
also that report's retry backoff. `ensure_lesson_report`'s own first insert
is the same story in miniature — two first calls can race on the primary key
— so it catches the loser's `IntegrityError` rather than letting it reach the
app's filing handler.

Only ids ever leave the app: `cites` carries belief ids, `report_outcome`
never sees a job's content. The bearer that reaches core-memory is vended
fresh per call and held nowhere (`config/vend.vend_envelope`, the
`mcp-gateway-api` credential a job's own `.mcp.json` already vends from —
`docs/design/agent-jobs.md` §Operational). `AgentSettings.core_memory_url`
is deployment configuration, empty by default: a deployment opts into the
learning loop by naming its core-memory, never carries one because the
factory assumes a household-wide service exists ("build nothing central").

## What stays out

- **No comparator.** Whether a result counts as "unchanged" is a review-form
  and domain question; the factory takes a `result` the app has already
  decided, never a value pair to compare itself.
- **No new worker, no new poller.** `report_outcome` attempts the two calls
  directly, in the request that reports them — a network fault aside, it
  settles inline exactly as `jobs.stop()` acts on a job row directly. What
  retries a fault rides the agent-jobs slice's OWN existing sweep
  (`jobs.supervise()`); this slice adds no second background loop of its own.
- **No new credential.** The bearer is the same `mcp-gateway-api` broker
  credential a job's MCP identity already vends from.

## The persona contract

The lesson instructions every persona needs — retrieve before working
(`belief_retrieve`), propose what would have got it right first time, cite
what was followed under `lessons_used` — belong in the factory's persona
contract in SPIRIT, not in a file the factory renders: `config/personas/` is
entirely app-owned, read fresh from disk on every spawn and never templated
(`persona.py`'s whole reason for reading fresh is that an app edits it with
no rebuild). There is nothing here for `copier` to stamp into.

So the standard is prose, carried here rather than hand-written per app
(`platform/canonical-app-shape.md` §Sameness extends to prose applies to an
app-owned file exactly as to a factory one — the difference is this slice
cannot enforce it mechanically, only state it once):

> Before you work, retrieve what this deployment already believes about the
> task ahead of you (`belief_retrieve` on your own domain and context). As you
> answer, if a lesson changed what you did, name what would have got it right
> the first time. Answer with `lessons_used`: the JSON array of ids of the
> beliefs you actually followed, `[]` when you followed none.

Every persona's own `CLAUDE.md` carries this paragraph verbatim, the same way
two apps' error messages and log lines already must
(`platform/canonical-app-shape.md`). godswood's own `CLAUDE.md`
(`config/personas/fat-controller/CLAUDE.md`) is the first to converge on it.

## Sequence

1. **Factory.** This slice, its migration, and `test_agent_lessons.py`
   proving the resume and refusal shapes against a monkeypatched
   `lessons._call` — core-memory's own tool behaviour is out of scope, as
   `test_agent_jobs_api.py` already draws the same line around the real CLI.
   Tag, once merged (never cut from a worktree branch).
2. **godswood moves onto it.** `pipeline/lesson_outcomes.py`'s periodic sweep
   retires in favour of a `report_outcome` call at the moment Fat Controller's
   own review UI records an execution confirmed or corrected;
   `unchanged()`/`_pending()` stay godswood's own (the comparator, and reading
   the execution's own confirmed/corrected state), `fc_lesson_outcomes` is
   dropped once `agent_job_lesson_reports` holds the same row shape.
3. **Every other app takes it on its next copier update.** Nothing changes
   for Milton, Penny or cadmus until a persona of theirs starts citing
   lessons; Taxpert takes it from its first stamp.
