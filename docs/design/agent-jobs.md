# Agent jobs

Status: **design, 29/09/2026.** `docs/design/agent-console.md` gave every
stamped app one persona chat: a person asks, `session.ask()` spawns `claude
-p`, streams its events back over the request, and the process dies with the
request. An app-started persona session is a different shape for the same
machinery — a document arrives with nobody asking, the agent reads it
unattended, and whoever is entitled opens the run afterwards or while it is
still going. godswood's Fat Controller built that as a private runner
(`godswood/backend/src/godswood/api/fat_controller/pipeline/{agent,job}.py`,
931 lines with `worker.py`/`mcp_config.py`/`turns.py`) because the factory had
nowhere for it to land. Per the operator's ruling on 29/09/2026 (every
household app is the same shape with different business logic, and every
persona runs on the same agent code), this is that home.

## Decision

**The factory carries an agent JOB slice beside the chat one: `jobs.py` (the
run, its control loop and the operations below), `jobs_models.py` (the job row
and its event log), `redact.py` (the in and out seams, shared with the chat)
and three routes on the existing `api/agent` router. The job row is the bus:
a deployment runs several worker processes and a job's CLI is a child of one
of them, so every request about a job, on whichever worker it lands, acts
through the row. Cost: about 1,400 lines of source, 680 of them code
(`jobs.py` 820, `jobs_models.py` 450, `redact.py` 70, two migrations 170),
against godswood's 931-line runner, which ran in one process and carried its
own document-pipeline vocabulary; this carries none of that vocabulary, and
what it adds over it is any-worker operation, resume, and the two seams.**

`--bg`/`claude agents` (the CLI's own background-session dispatcher) was
measured and rejected: `claude -p --bg` refuses outright ("--bg and --print
conflict: --print never starts the interactive session that `claude agents`
attaches to"), because it is the CLI's worktree-based coding-agent
dispatcher, a different feature from a headless `-p --output-format
stream-json` turn.

## The CLI as it measures

Driven as a job drives it (2.1.283, `--input-format stream-json`):

- A prompt on the command line is ignored; with stdin closed at once the CLI
  exits 0 having printed nothing. Every turn, the first included, is a `user`
  frame on stdin.
- After a turn's `result` the CLI stays alive for as long as stdin is open,
  and exits once stdin closes and every frame it has read is answered — two
  frames then EOF is two turns, then exit.
- `--replay-user-messages` echoes each frame back (`type: "user"`,
  `isReplay: true`) at the start of the turn that consumes it.
- Every `assistant` frame carries `stop_reason: null`; `--include-partial-messages`
  adds token deltas as their own `type: "stream_event"` lines.
- A Read of an image returns its bytes twice: the Messages API
  `{"type": "base64", "data": ...}` source inside the `tool_result`, and the
  CLI's own `tool_use_result.file.base64` beside the pixel dimensions.
- Each session keeps a transcript at `$CLAUDE_CONFIG_DIR/projects/<cwd>/<session>.jsonl`.

So a job writes its prompt and every message as frames, asks for the echo
(which is also how a watcher sees both sides of the conversation, in order),
and closes stdin once a `result` has arrived and every frame written has been
echoed back. It asks for no token deltas: every event it keeps is whole.

## What answers each need

1. **Started by the app, no asker.** `jobs.start(db_session_factory,
   settings, persona, workspace_id=..., created_by_id=..., prompt=...,
   job_id=..., files=..., json_schema=..., append_system_prompt=...,
   mcp_config=..., model=...)` is a plain async function, not a route. It
   seeds the job's folder (`jobs.job_dir(job_id)`) with `files`, inserts the
   row, and returns `job_id` before the CLI has spawned. A caller that must
   name a seeded file by absolute path in the prompt (Read takes nothing
   else) mints the id first with `jobs.new_job_id()`.
2. **Keeps running with nobody watching.** The run is an `asyncio.Task` held
   in `_tasks`, independent of any request.
3. **Watched from any worker.** `GET .../jobs/{job_id}/watch` reads the event
   log forward from the database until no live process is running the job,
   then ends; every worker sees the same stream.
4. **Messaged from any worker.** `POST .../message` queues onto the row when
   a live process is running the job, which writes it onto its CLI's stdin
   within a poll; otherwise it reopens the job and resumes it here via
   `--resume`, replaying the schema, system prompt, MCP config and model the
   job started with. A run that ends with messages still queued is resumed
   with them rather than settled, so nothing sent is dropped between runs.
5. **Stopped from any worker.** `POST .../stop` flags the row; the running
   process kills its CLI's process group at its next poll, or at once when
   the stop lands on that process, and the run settles `cancelled`.
6. **On the starter's model.** `model` is `--model` on every run, a resume
   from any worker included; the persona's `settings.json` is the default.
7. **What comes out is the app's to rewrite.** `app_hooks.agent_event(persona,
   event)` sees every event before a job keeps it or a chat forwards it, and
   returns it rewritten or `None` to drop it. The job's own synthetic error
   event goes through it too, and `job.error`/`job.structured_output` are
   read off what it returned. The CLI's stderr tail is first stripped of
   anything shaped like a bearer token or a URL query string.
8. **Bounded storage.** No token deltas are asked for; an image or document
   is kept by reference (the `tool_use` naming its file, the dimensions beside
   it), never its bytes. `jobs.cleanup()` removes the job's folder and every
   artefact the CLI kept under the persona's shared home for that session,
   its transcript included.
9. **Told when a run settles.** `app_hooks.agent_job_settled(outcome)` is
   called with each settled run's `JobOutcome` — a resumed one's answer
   included — in whichever process settled it. Polling the row is not the
   intended shape.

## Any worker

The running process holds the job by `run_id` and refreshes `heartbeat_at`
every 10 s; a `running` row whose heartbeat is older than 90 s (gunicorn's
60 s worker timeout plus a beat) has no process behind it. Every transition
is one `SELECT ... FOR UPDATE` and one commit on the row
(`jobs_models.enqueue_or_reopen`/`poll_run`/`settle_or_continue`), so two
workers acting on one job serialise on the row: two messages at once reopen it
once and queue the second. Every write the running process makes is
conditional on its own `run_id`, so a process that lost the job can change
nothing.

Every worker runs `jobs.supervise()` from its lifespan, as a background task:
a sweep at boot and every 60 s settles a job whose heartbeat has gone stale
as `failed` — never a live job another worker holds — and a failed sweep is
logged and retried, so a worker boots with no database reachable. On
shutdown a worker kills its own runs and settles them `failed`. An app that
starts long jobs sets `GUNICORN_MAX_REQUESTS=0` (`gunicorn.conf.py`), or a
worker recycle ends its runs every thousand requests.

## Streaming

`jobs.start(stream=True)` runs the CLI with `--include-partial-messages` (a column on the job, so every resume streams too) and a watcher sees text, thinking and tool-input deltas as they are written instead of whole messages. The deltas ride the same event log, not a process-local relay, because the watcher is usually on another worker (§Any worker). To keep that cheap, `jobs._Deltas` folds them into about four `stream_event` rows a second (consecutive deltas of one block concatenated; block starts kept, since they name a tool; signatures, empty thinking and message framing dropped), and the finished `assistant` message deletes the job's `stream_event` rows in the commit that records it. A job read after the fact holds whole messages only; a watcher renders each `stream_event` into the message in progress and replaces it when the `assistant` event lands. Off by default: a batch job nobody follows writes no deltas.

## Tenancy

`AgentJob`/`AgentJobEvent` are `WorkspaceScoped` — a document belongs to a
workspace, and a job reading one does too. Every session `jobs.py` opens is
created outside a request (the app's plain engine-bound sessionmaker; a job's
writes outlive the request that triggered them), so every path binds it with
`db.scoping.bind_session()` before touching either model. `jobs.authorize()`
is the one read with no workspace bound yet — an explicit `unscoped()` lookup
by `job_id`, compared against the caller's `workspace_id` and the URL's
`persona`, refusing with one 404 for every way to fail, as `ownership.DENIAL`
does for a private chat. The persona half matters: an `agent-<name>`
entitlement and workspace membership say nothing about a different persona's
job in the same workspace. The orphan sweep is the other `unscoped()` read,
the carve-out `platform/tenancy.md` gives a job whose job is the whole estate.

## What stays out

- **No queue service, no worker process.** A job is an `asyncio.Task` on the
  app's own event loop; the database the app already runs is the only thing
  its workers share.
- **No house vocabulary.** Every event kept is Claude Code's own, less what
  the app's hook rewrites and the bytes of an image; `AgentJobEvent.event` is
  one JSONB column, not a typed turn model. godswood's `turns.py` stays
  godswood's, reading this log for its own execution view.
- **No personal owner.** A job belongs to no asker — `created_by_id` is
  attribution only — but to a workspace and a persona.

## Operational

- **Concurrent stderr draining.** `_drain_stderr()` reads stderr beside the
  stdout loop, keeping a bounded tail; a child filling its 64 KiB stderr pipe
  otherwise blocks before its next stdout line. A read error there loses the
  tail, never the run's settling.
- **A job's own MCP identity, with no credential persisted.** `mcp_config` is a
  parsed `.mcp.json` object, kept on the row and rewritten to the job's folder
  on every run: how a caller binds the job's own identity into the servers it
  reaches. A credential in it is minted by a `headersHelper` command at spawn,
  the contract a persona's own `.mcp.json` is held to;
  `_refuse_literal_mcp_credentials()` refuses a credential-shaped header set
  directly.
- **The gateway.** `AgentSettings.gateway_url` is deployment configuration;
  `gateway_key` is vended from the broker (`<app>-gateway`, field `value`)
  only while a URL is set, under the name in `gateway_key_credential` when
  the gateway named the key itself. With a URL set, the child reaches the
  gateway and nothing else: the OAuth token the direct path uses is withheld.

## Sequence

1. **Factory.** The slice, its two migrations, and `test_agent_jobs_api.py`
   driving a fake CLI that behaves as the real one measures — including a
   second real worker process that boots beside a live job, stops one, and
   watches, messages and resumes another. Tag.
2. **godswood moves its reader onto it.** `pipeline/agent.py::run_agent` and
   `pipeline/job.py::run_job` become calls into `jobs.start`/
   `jobs.send_message` with `app_hooks.agent_event` carrying its scrub and
   `app_hooks.agent_job_settled` taking an answer back into its pipeline;
   `pipeline/worker.py`'s poll loop, `sse.py` and `mcp_config.py` retire —
   `turns.py` stays, reading this slice's event log. `job.py`'s document
   logic is business logic above the session primitive and is unaffected.
3. **library and pebblestone take it on their next copier update.** Nothing
   changes for them until a persona of theirs needs an app-started run.
