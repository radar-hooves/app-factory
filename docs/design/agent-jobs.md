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
`jobs.py` (spawn, in-process pub/sub, the five operations below), `jobs_models.py`
(the job row and its verbatim event log) and three routes on the existing
`api/agent` router. Cost: about 620 lines — `jobs_models.py` 130, `jobs.py`
330, the router and schema additions 90, the migration 70 — against
godswood's 931-line private runner it replaces, because this slice carries
none of godswood's own document-pipeline vocabulary (`turns.py`'s 180-line
turn/tool-call interpreter, `worker.py`'s 531-line poll loop) — only the
primitive every app needs under it.**

`--bg`/`claude agents` (the CLI's own background-session dispatcher) was
measured and rejected: `claude -p --bg` refuses outright ("--bg and --print
conflict: --print never starts the interactive session that `claude agents`
attaches to"), because it is the CLI's own worktree-based coding-agent
dispatcher, a different feature for a different job than a headless
`-p --output-format stream-json` turn.

## The five needs, and what answers each

1. **Started by the app, no asker.** `jobs.start(db_session_factory,
   settings, persona, prompt=..., files=..., json_schema=..., append_system_prompt=...)`
   is a plain async function, not a route — seeds a per-run working folder
   under `data/agent-jobs/<job_id>/` with the given `files`, inserts the job
   row, and returns `job_id` before the CLI has even spawned.
2. **Keeps running with nobody watching.** The run is an `asyncio.Task` held
   in a module dict (`_tasks`) so nothing garbage-collects it, independent of
   any request's lifetime; a closed tab has never held a reference to it.
3. **Opened by an entitled user at any time.** `GET
   /api/agent/{persona}/jobs/{job_id}/watch` replays the job's persisted
   event log, then — if the job is still running — subscribes to its live
   fan-out (`_JobBus`, an in-process `asyncio.Queue` per open job) and keeps
   streaming, on the SAME frame shape `ask()` already produces, so
   `@poodle64/librarian`'s renderer needs no second code path.
4. **A message while it is working, a reply once it has finished.** `POST
   .../message` branches on whether the job's process is still alive: while
   it is, the message is a `stream-json` frame written straight onto its open
   stdin (`--input-format stream-json`); once it has exited, the same call
   starts a NEW run under the SAME job id via `--resume`, replaying the
   `json_schema`/`append_system_prompt` the job started with.
5. **Stopped by the user.** `POST .../stop` kills the job's process group;
   its finally block settles the row as `cancelled` rather than `failed`.

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
  view, layered on top of this slice's raw log, never absorbed into it.
- **No per-job owner.** Unlike `ownership.py`'s private chat sessions, a job
  belongs to no asker — any caller entitled to the persona (`agent-<name>`)
  may watch, message or stop it, because the app started it, not a person.

## Sequence

1. **Factory.** `jobs_models.py`, `jobs.py`, the three routes, the
   `agent_jobs`/`agent_job_events` migration, `test_agent_jobs_api.py`
   driving the fake CLI through a fresh start, a live stdin message, a
   post-finish resume, and a stop. Tag.
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
