# Agent jobs

Status: **design, 29/09/2026.** `docs/design/agent-console.md` gave every
stamped app one persona chat: a person asks, `session.ask()` spawns `claude
-p`, streams its events back over the request, and the process dies with the
request. godswood's Fat Controller needed a different shape for the same
persona machinery — a document arrives with nobody asking, the agent reads it
unattended, and whoever is entitled opens the run afterwards or while it is
still going — and built it as a private runner
(`godswood/backend/src/godswood/api/fat_controller/pipeline/{agent,job}.py`,
931 lines with `worker.py`/`mcp_config.py`/`turns.py`) because the factory had
nowhere for it to land. Per the operator's ruling on 29/09/2026 (every
household app is the same shape with different business logic, and every
persona — Milton, Penny, the Fat Controller, Taxpert — runs on the same agent
code), this is that home.

## Decision

**The factory gains an agent JOB slice beside the existing chat one:
`jobs.py` (spawn, in-process pub/sub, the five operations below),
`jobs_models.py` (the job row and its verbatim event log), `redact.py` (the
one redaction seam, shared with the chat slice) and three routes on the
existing `api/agent` router. Cost: about 850 lines against godswood's
931-line private runner it replaces — `jobs_models.py` 145, `jobs.py` 650,
the router/schema/redact additions 90, the migration 95 — because this slice
carries none of godswood's own document-pipeline vocabulary (`turns.py`'s
180-line turn/tool-call interpreter, `worker.py`'s 531-line poll loop) — only
the primitive every app needs under it. The jump from the first cut's ~620 is
tenancy, the two spawn/cancel races, and bounded storage — §Tenancy and
§Concurrency below — caught by a fresh-context review of that cut before
anything had adopted it.**

`--bg`/`claude agents` (the CLI's own background-session dispatcher) was
measured and rejected: `claude -p --bg` refuses outright ("--bg and --print
conflict: --print never starts the interactive session that `claude agents`
attaches to"), because it is the CLI's own worktree-based coding-agent
dispatcher, a different feature for a different job than a headless
`-p --output-format stream-json` turn.

## The five needs, and what answers each

1. **Started by the app, no asker.** `jobs.start(db_session_factory,
   settings, persona, workspace_id=..., created_by_id=..., prompt=...,
   files=..., json_schema=..., append_system_prompt=..., mcp_config=...)` is
   a plain async function, not a route — seeds a per-run working folder
   under `data/agent-jobs/<job_id>/` with the given `files`, inserts the job
   row (stamped to `workspace_id`), and returns `job_id` before the CLI has
   even spawned.
2. **Keeps running with nobody watching.** The run is an `asyncio.Task` held
   in a module dict (`_tasks`) so nothing garbage-collects it, independent of
   any request's lifetime; a closed tab has never held a reference to it.
3. **Opened by an entitled user at any time, within their own workspace.**
   `GET /api/agent/{persona}/jobs/{job_id}/watch` checks the job belongs to
   the caller's `CurrentWorkspace` (`jobs.authorize()`), replays the job's
   persisted event log, then — if the job is still running — subscribes to
   its live fan-out (`_JobBus`, an in-process `asyncio.Queue` per open job)
   and keeps streaming, on the SAME frame shape `ask()` already produces, so
   `@poodle64/librarian`'s renderer needs no second code path.
4. **A message while it is working, a reply once it has finished.** `POST
   .../message` branches on whether the job's process is still alive: while
   it is, the message is a `stream-json` frame written straight onto its open
   stdin (`--input-format stream-json`); once it has exited, the same call
   starts a NEW run under the SAME job id via `--resume`, replaying the
   `json_schema`/`append_system_prompt`/`mcp_config` the job started with.
   The whole check-then-spawn decision runs under a per-job `asyncio.Lock`
   (`_lock_for`), so two messages arriving the instant a run finishes cannot
   both spawn a resume for the same Claude Code session.
5. **Stopped by the user.** `POST .../stop` sets the CURRENT run's cancel
   `Event` (created fresh at spawn, before the lock that decided to spawn is
   released) and kills any live process group; `_run()` checks its own event
   the moment its process is registered, so a stop arriving in the gap
   between a resume being scheduled and its process existing still lands.

## What stays out

- **No queue, no worker process.** A job is one `asyncio.Task` on the app's
  own event loop — the monolith-with-in-process-jobs constraint this slice
  was built to. `jobs.py`'s own pub/sub (`_JobBus`) is the in-process
  equivalent of godswood's thread-based `SseEventBus`, ported to `asyncio`
  because the app it lives in is async.
- **No house vocabulary.** Every event persisted and replayed is exactly what
  Claude Code printed; `AgentJobEvent.event` is one JSONB column, not a typed
  turn/tool-call model. godswood's `TurnRecorder`/`turns.py` stays
  godswood's own — an interpretation of the stream for ITS OWN execution
  view, layered on top of this slice's raw log, never absorbed into it. The
  one structural fact this slice DOES read off an event — `message.stop_reason`,
  the Anthropic Messages API's own field, populated only once a turn
  completes — decides storage, never content: `_is_partial()` skips
  persisting a still-growing `--include-partial-messages` chunk (it is
  broadcast live regardless), so `agent_job_events` grows one row per
  settled message, not one per token.
- **No per-job personal owner.** Unlike `ownership.py`'s private chat
  sessions, a job belongs to no ASKER — `created_by_id` is attribution only.
  It DOES belong to a workspace: any caller entitled to the persona
  (`agent-<name>`) *and* a member of that workspace may watch, message or
  stop it.

## Tenancy

`AgentJob`/`AgentJobEvent` are `WorkspaceScoped` — a document belongs to a
workspace, and a job reading one does too. Every session `jobs.py` opens is
created OUTSIDE a request (`db_session_factory()`, the app's plain
engine-bound sessionmaker — a job's writes must outlive the one request that
triggered them, so nothing binds it to a workspace the way `CurrentWorkspace`
binds a request's own session), so every write path calls
`db.scoping.bind_session()` itself before touching either model.
`jobs.authorize()` is the one read with no workspace bound yet — an explicit
`unscoped()` lookup by `job_id` alone, comparing what it finds against the
caller's own `workspace_id` and refusing (404, one answer for "no such job"
and "not yours") on any mismatch, mirroring `ownership.DENIAL`'s reasoning
for a private chat session. The three HTTP routes all call it before doing
anything else; `jobs.start()`'s caller supplies `workspace_id` directly, since
it usually has a `CurrentWorkspace` already resolved from wherever the job's
own trigger fired.

## Concurrency

Two failure modes needed their own fix, both from the SAME root cause — job
state (`_processes`, `_tasks`, and now `_cancel_events`) living in plain
module dicts with no synchronisation of its own:

- **Two resumes racing.** `send_message()`'s whole "is it live, is it
  between runs, mark it running, spawn the resume" decision runs inside one
  per-job `asyncio.Lock`, held across the `await` that flips the row to
  `running` — so a second concurrent call, once it acquires the lock, always
  sees the up-to-date status and is refused (`BadRequestError`) rather than
  also spawning.
- **A stop arriving before its process exists.** `_spawn_run()` creates a
  fresh `asyncio.Event` and registers it BEFORE the task that will use it is
  even created — synchronously, with no `await` in between — so `stop()`,
  whenever it runs, always has something to set. `_run()` checks that same
  event the moment its subprocess is registered, closing the gap where a
  stop issued the instant a resume is scheduled used to no-op silently.

Neither is a general-purpose actor/mailbox pattern — one lock, one flag per
run, exactly the two decisions that needed to stop racing.

## Operational

- **A restart cannot orphan a job.** `main.py`'s `_db_lifespan` calls
  `jobs.reconcile_orphaned_jobs()` once at startup: any row still `running`
  belonged to a process that no longer exists (its subprocess died with it),
  so it is marked `failed` rather than left permanently unresumable. Factory-
  owned rather than an `app_hooks.lifespan_tasks` default, since an app's own
  `app_hooks.py` is sanctioned-per-app and never overwritten by `copier
  update` — a default living there would reach only a brand-new stamp.
- **Concurrent stderr draining.** A child that fills its stderr pipe (64 KiB)
  before anything reads it blocks on that write — and since nothing was
  reading stdout either at that moment, the whole turn would deadlock rather
  than merely running noisily. `_drain_stderr()` runs alongside the stdout
  read loop as its own task, keeping only a bounded tail for the failure
  diagnostic.
- **Reclaiming a job's own disk.** `jobs.cleanup(job_id, workspace_id=...)`
  removes its working folder, refusing while the job is still `running`.
  Nothing calls it automatically — the default lifetime is forever, same as
  `persona.py`'s seeded homes — an app calls it once its own record of the
  job is settled.
- **A job's own MCP identity.** `start()`'s `mcp_config` is a parsed
  `.mcp.json` object, persisted on the job row and rewritten to disk on every
  run including a resume: this is how a caller binds the job's own identity
  (a stdio server's own args, an HTTP header) into the servers it reaches —
  godswood's `pipeline/mcp_config.py` builds exactly this shape today, bound
  by hand into a file the old private runner wrote itself.

## Sequence

1. **Factory.** `jobs_models.py`, `jobs.py`, `redact.py`, the three routes,
   the `agent_jobs`/`agent_job_events` migration, `test_agent_jobs_api.py`
   driving the fake CLI through a fresh start, a live stdin message, a
   post-finish resume, a stop, cross-workspace refusal on all three routes,
   the two concurrency fixes, orphan reconciliation, bounded partial
   storage, a chatty child's stderr, working-folder cleanup and a resumed
   run's MCP identity. Tag.
2. **godswood moves its reader onto it.** `pipeline/agent.py::run_agent` and
   `pipeline/job.py::run_job` are replaced by calls into `jobs.start`/
   `jobs.send_message`; `pipeline/worker.py`'s poll loop, `sse.py` and
   `mcp_config.py` retire with them — `turns.py` stays, reading this slice's
   event log instead of `on_event` callbacks, since the execution view it
   feeds is godswood's own. `job.py`'s own document-pipeline logic (context
   resolution, dedupe, reconcile rules, the look-again pass) is unaffected:
   it is business logic ABOVE the session primitive, not part of it.
3. **library and pebblestone take it on their next copier update.** No
   change needed on their side until a persona of theirs needs an
   app-started run; the chat slice they already carry is untouched by this
   one landing beside it.
