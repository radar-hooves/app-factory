# Agent console

Status: **design, 30/09/2026.** Need: radar-hooves/cadmus (Nightjar), 30/09/2026. Colleagues chat with Milton about a collection (PACMAN, DASR, any collection) and keep their conversations, in a chat that behaves as people now expect; every app that lets a person chat with an agent gets that same product from the factory.

## Decision

**A room is what a person is granted: one agent, either a local persona or Milton over named collections, entered with one `room-<id>` entitlement. The factory gives every app rooms in three layers: an imported kit, `agent-common`, that drives either agent in the one wire vocabulary both already speak; a stamped slice that binds it to the app's people (rooms, conversations, quota, the turn, the routes); and a stamped page built from `@poodle64/librarian`, which gains the conversation list and the chat controller. cadmus's rooms become three rows of `config/rooms.yaml`.** Cost: about 2,520 lines written (kit 1,050, librarian 690, the stamped slice 481 net, a library client in api-clients about 300) against about 4,400 deleted (cadmus 3,675 net, library 512, godswood 140, librarian 78): about 1,880 fewer lines of source and 1,320 fewer of tests across the estate. Each of the nine stamped apps (the eight that carry `api/agent/` today, and portcullis) carries the slice's 481 on its next converge.

The one wire vocabulary is Claude Code's own stream-json events, verbatim, plus the library's `citations`, `suggestions` and `library_error` frames. The factory's local spawn emits the first; the library's caller door emits all four; `@poodle64/librarian`'s `Transcript` folds both. Nothing translates, which is what lets one page serve both kinds of agent.

`room` is the proper name, taken from cadmus, where colleagues already hold `room-<id>` grants. It is a word for code, routes and entitlements only: the page says "Ask Milton about ADF Pay and Conditions" (`platform/canonical-app-shape.md` §Milton is a person, not a place).

## The structure

```d2
vars: {d2-config: {layout-engine: elk}}
direction: right

browser: "Browser" {
  page: "routes/rooms/[room]?c=<conversation>\n(stamped)"
  pkg: "@poodle64/librarian\nchat · conversation-list\nconversation · composer"
  ext: "src/lib/agent/app.ts\n(app-owned, empty by default)"
}
proxy: "Authentik forward-auth\nroom-<id>, granted by invitation"
slice: "api/agent (stamped, parity-gated)" {
  router: "router.py\nrooms · ask · conversations · quota · jobs"
  rooms: "rooms.py\nconfig/rooms.yaml"
  turn: "ask.py: the turn\nquota · owner · stream · stop"
  conv: "agent_conversations\n(one person's)"
  quota: "agent_question_counts"
  jobs: "jobs.py\nagent_jobs (a workspace's)"
  hooks: "app_hooks.py\nagent_turn · agent_event\nagent_turn_settled"
}
kit: "agent-common (imported, kits/python)" {
  agent: "Agent\nask · read · forget"
  local: "LocalAgent\ncli · persona · transcript"
  remote: "LibraryAgent"
}
client: "api-clients\nlibrary client"
cli: "claude -p\nconfig/personas/<name>"
library: "library /api/caller\nMilton, one GPU"

browser.page -> browser.pkg
browser.page -> browser.ext
browser.pkg -> proxy: "SSE"
proxy -> slice.router: "x-authentik-* + entitlements"
slice.router -> slice.rooms
slice.router -> slice.turn
slice.router -> slice.jobs
slice.turn -> slice.conv
slice.turn -> slice.quota
slice.turn -> slice.hooks
slice.turn -> kit.agent
slice.jobs -> kit.local
kit.agent -> kit.local
kit.agent -> kit.remote
kit.local -> cli
kit.remote -> client -> library
```

## What each layer holds

### Imported: `agent-common`

A Python kit at `kits/python/agent-common/`, beside the Rust kits, in a uv workspace rooted at the repo root because the shared `publish-wheels` reusable api-common publishes with builds the workspace from there. Each release tag publishes it to the household's private index at that tag's version, so its version is the factory release that shipped it, as a Rust kit's `tag` pin is, and the stamped `pyproject.toml` pins it `>=` (`platform/common-libraries.md`). The factory self-test runs its own gates and resolves it from the checkout, so a change to kit and slice is tested together. It holds no table, no route and no import from an app: the stamp binds it, `api/agent/persona.py` to `config/personas/`, `data/agent-homes/` and `NotFoundError`, and `AgentSettings.driver()` to the deployment's knobs.

- `cli`: the Claude Code driver. Argv and environment, a spawn in its own process group, the idle-timeout read loop, the stderr tail and its scrub, the kill, and the stream-json stdin turns a job uses. It authenticates with `CLAUDE_CODE_OAUTH_TOKEN` vended from the broker and talks to Anthropic directly; the gateway pair stays optional. It takes the CLI's own `--append-system-prompt`, `--model` and working directory, which jobs pass and the library's scoped Milton needs, so the library runs on this driver rather than its own.
- `persona`: loads a persona directory and seeds its writable home.
- `transcript`: reads and forgets a session in a Claude Code home, as turns (the library's `api/librarian/conversation.py`).
- `Agent`: `ask(question, resume, files)` yielding events, `read(session)` returning its turns (None once it is gone), `forget(session)`. A local persona files a person's attachments under its home by conversation and names them in the question by path. `LocalAgent` is the three above; `LibraryAgent` is the library's caller door through a `library` client in api-clients, where every household service's client lives.

### Stamped: `api/agent/`

Bound to the app's own tables, identity and entitlements, so it is stamped and parity-gated rather than packaged.

- `rooms.py` loads and validates `config/rooms.yaml` at start (below).
- `conversations.py` holds `agent_conversations`, which replaces `agent_sessions`: `session_id` (the agent's own id, the conversation's public id), `user_id` NOT NULL with CASCADE (personal-subject in `db/registry.py`), `room`, `title`, `last_activity_at`, `turns`, `answering_since`, `stop_requested`. It claims a session on its `init` event, refuses a foreign or unknown resume with one answer, lists, renames, deletes (the agent's transcript first, then the row) and exports Markdown.
- `quota.py` holds `agent_question_counts`: one atomic upsert per question per person per local day across every room, admins exempt, `<APP>_AGENT_DAILY_QUESTIONS` (default 40, cadmus's value; 0 turns it off).
- `ask.py` is the turn (below).
- `router.py`: `GET rooms`; `POST rooms/{room}/ask` (JSON or multipart, so attachments reach either agent); `GET`, `PATCH` and `DELETE conversations/{id}`, its export, its stop and, in a library room, its answer mark; `GET rooms/{room}/documents/{id}` in a library room, so a citation opens; `GET quota`; the job routes unchanged.
- `jobs.py`, `jobs_models.py` and `lessons.py` are unchanged but for the driver they import.
- `app_hooks.agent_turn` and `agent_event` stand as the in and out seams; `agent_turn_settled(room, conversation, turn)` is new, for an app that files something against an answer.
- `routes/rooms/+page.svelte` (the caller's rooms) and `routes/rooms/[room]/+page.svelte` replace `routes/agent/[persona]`. The room page calls into an app-owned `src/lib/agent/app.ts` for what a citation opens, how an answer is decorated and what sits on a room's home; the factory's copy exports nothing.
- A self-test that walks the app's route table and fails any route outside the factory's person-facing set (identity, own workspace, feedback, rooms) that declares no module dependency. That is what makes "a colleague admitted by invitation reaches exactly the rooms granted and nothing else in the app" a gate rather than a convention.

### `@poodle64/librarian` gains

- `./chat`: the page's controller: `open(conversation)`, `ask`, `stop`, `again`, `new`, with `turns`, `running`, `answering`, `waiting`, `quota` and `conversationId`, over a room's routes or a job's watch, message and stop. Taken from the generic half of cadmus's room page and godswood's `reader-watch.svelte.ts`.
- `./conversation-list`: newest first, reopen, rename, download, delete, new. Taken from cadmus's `PastQuestions.svelte`.
- An answer mark (helpful or not, with a note), rendered only when the host passes `onmark`, as follow-ups render only with `onsuggest`. Taken from cadmus's `AnswerFeedback.svelte`.
- A fair-use notice, and a waiting state beside the elapsed clock `working` already shows: "Milton is answering another question first", when the agent says so.
- `history.svelte.ts`, browser-only history, is deleted once no page reads it.

## The turn, for a slow agent

Milton answers in 30 to 260 s on one GPU (median 85 s, `/media/hydrant/tmp/milton-eval/scorecard.md`), and two concurrent asks stall. So:

- The asking request streams the turn token by token, but the turn is a task in the worker, not the request. A refresh, a locked phone or a closed tab leaves it running, and its answer lands in the agent's transcript.
- `answering_since` says a turn is in flight. Reopening the conversation's link shows "still answering" with its clock and reads the conversation again when the stamp clears. A worker that dies mid-turn leaves a stamp older than the idle timeout, which reads as not answering.
- Stop is a `POST` that sets `stop_requested`; the worker holding the turn looks every second and ends it, killing the local CLI or closing the library stream, on which the library kills Milton's process (`api/librarian/session.py`).
- A question is charged when the agent accepts it, so a dropped connection costs nothing it did not answer.
- Again asks the same question as a new turn. A conversation is append-only because Claude Code's transcript is.
- Waiting behind another asker is the library's to say and the page's to show. The idle read timeout is `<APP>_AGENT_TIMEOUT_SECONDS`, and the library's waiting frame is also what keeps it from firing on a queued ask.

## Rooms

```yaml
# config/rooms.yaml: app-owned, like config/actors.yaml
pacman:
  title: ADF Pay and Conditions
  blurb: Ask about ADF pay, allowances, leave and conditions of service.
  examples:
    - How much recreation leave does a permanent member accrue in a year?
  not_held: your own pay records, your posting order, or anything about your individual case
  library:
    collections:
      defence-personnel: the ADF Pay and Conditions Manual (PACMAN)
    preamble: You are Milton, the librarian for the ADF Pay and Conditions room. …
penny:
  title: Penny
  blurb: Ask Penny about the practice.
  persona: penny
```

A room names exactly one of `persona` (a directory under `config/personas/`) or `library`. `room-<id>` enters it; watching a persona's jobs stays `agent-<persona>`. A library room's collections are the room's, never the browser's, and the library intersects them with the app's caller grant. A library room needs the app enrolled as a caller in the library's registry, `<APP>_AGENT_LIBRARY_URL`, and its caller credential vended through `config/vend.py`. An app with no `config/rooms.yaml` shows no rooms, and its personas still run jobs.

## The persona contract

A persona is a directory shaped as a Claude Code home: `CLAUDE.md` (who it is), `settings.json` (`model`, `permissions.allow`, `permissions.deny`, hooks) and `.mcp.json` (the servers it holds: the app's own `/mcp`, the library, named fleet servers). The alias is settings.json's own `model` key; there is no fourth file. Defaults live in the app at `config/personas/<name>/`, app-owned like `config/actors.yaml`; `<APP>_AGENT_PERSONAS_DIR` names an overriding directory, read at every spawn, so an edit reaches the next turn without a restart. The kit seeds a writable home per persona under `data/` on first use, because Claude Code writes to its home. The tool lists reach the CLI as `--allowedTools` and `--disallowedTools` from that same file, so file and flags cannot disagree.

## What each app keeps

| App | Becomes | Keeps |
| --- | --- | --- |
| cadmus | Three library rooms in `config/rooms.yaml`; `room_sessions` and `room_question_counts` rows move into the factory's tables; `room-<id>` grants and invitations unchanged | The never-cite guard, as a test over `config/rooms.yaml`; the Record pane, entity links, Lately and briefings, through `src/lib/agent/app.ts` and `agent_turn_settled`; `room_artefacts` |
| godswood | Unchanged in shape: the Fat Controller is the jobs product, not a second console | The reading beside the run, the waiting list and the question a run asks; only the run's conversation moves onto `chat` in job mode |
| library | The remote agent; `/api/caller` is the one remote contract | Its scoped Milton (scope, cascade, reach, citations, attachments), on the kit's driver; its Console. Its two Milton engines, Claude Code and the LiteLLM reading room, are the library's to converge |
| pebblestone | Its personas become local rooms when it takes the factory's identity slice (full-stack-app-template#31) | The Teams bot: a channel with its own Anthropic API loop and tables, which it may move onto a room's agent |
| casefile, mission-command, eight, earworm, portcullis | Nothing until one writes `config/rooms.yaml` | |
| claudette | Untouched: a gateway, not a chat product | Its CLI pool; it may import the kit's driver |

## The count, from source

Estimates carry "about"; everything else is `wc -l` at 30/09/2026.

| Repo | Deleted | Added | Net |
| --- | --- | --- | --- |
| factory `template/` (stamped) | 884: `session.py` 266, `persona.py` 172, `ownership.py` 97, `ask.py` 77, the driver in `jobs.py` about 150, `routes/agent/[persona]` 122 | about 1,365: `conversations.py` 280, `ask.py` 220, `router.py` 170, `quota.py` 150, `schemas.py` 130, the migration 110, `rooms.py` 90, `config/sections/agent.py` 35, two pages 180 | +481, carried by each stamped app |
| factory `kits/python/agent-common` | 0 | about 1,050: `cli` 400, `transcript` 250, `persona` 170, `Agent` 120, SSE framing 50, packaging 60 | +1,050 |
| api-clients | 0 | a `library` client, in api-clients' own shape, about 300 | +300 |
| design-system `packages/librarian` | 78: `history.svelte.ts`, once unread | about 690: `chat` 260, `conversation-list` 230, the answer mark 110, fair-use and waiting 90 | +612 |
| cadmus | about 3,905: `api/rooms/` 2,055 of 2,165; `components/ask/`, `components/rooms/`, `lib/api/rooms.ts`, `lib/rooms/scope.ts` and the generic halves of `utils/ask.ts` and both room pages, 1,850 | about 230: `config/rooms.yaml` 90, a data migration 60, the extension module and hook 80 | −3,675 |
| library | 512: `api/librarian/session.py` 217, `api/librarian/conversation.py` 295 | 0 | −512 |
| godswood | about 140: `reader-watch.svelte.ts` 76 and `RunSession.svelte`'s watch, message and stop | 0 | −140 |
| **Source** | | | **about −1,880** |
| Tests | cadmus about 3,800 (backend 2,100 of 2,341, frontend 1,700 of 2,202) | factory self-test about 1,380 (rooms, conversations, quota and the turn 1,000; the route walk 80; E2E 300), kit 700, librarian 400 | about −1,320 |

## Considered and rejected

- **Everything in the kit, the stamp a forty-line wiring file.** The kit would take the app's `Base`, the `users` foreign key, the tenancy registry, the identity dependency, the entitlement check and an Alembic branch as seams, six places its assumptions can break silently, to save stamped lines the parity gate already keeps identical.
- **Everything stamped, the slice grown in place.** The CLI driver sits in eight stamped copies across five factory generations today, and the library runs a second driver of its own; one more stamped engine multiplies both.
- **Every turn a job.** A job keeps whole events only, so the asker loses the typing stream, and a job is a workspace's data where a conversation is one person's (`platform/tenancy.md`). The turn borrows the job's row flags, not its table.
- **Again replacing the answer** (`--fork-session`). Each regenerate mints a session, splitting one conversation into branches the list would have to show.
- **Rooms as code** (cadmus's `registry.py`, kept there so a wrong room is a bug rather than an operator mistake, with no admin surface). The file keeps both properties: it is committed, reviewed and released like code, there is still no admin surface, and `rooms.py` refuses to start on a room naming no agent or both, an unknown persona, or a collection without a reader's name. What changes is that a room for another collection is a row and an entitlement, not a module edit.
- **A queue in the consuming app.** The contention is Milton's one GPU, and only the library sees every caller.
- **The library client inside the kit.** The library is a household service, and its client belongs with every other in api-clients.

## Needs this design files

- **api-clients:** a client for the library's caller door: the streamed ask, conversation read and forget, the answer mark, a document, and collection summaries for a room's scope line.
- **library:** say when an ask waits behind another, and keep saying it at least every 30 s while it waits; take a room's preamble as its own field, so a reopened conversation shows the question the colleague asked.

## Convergence, each step proven before the next

1. **The kit.** `kits/python/agent-common` with the driver, persona and transcript lifted from `session.py`, `persona.py`, `jobs.py` and the library's `conversation.py`, and its publish job; the stamped chat and jobs import it with behaviour unchanged. Proven by the factory self-test and a fresh stamp answering one persona. Tag.
2. **The library client** in api-clients, in its own shape, and `LibraryAgent` in the kit. Proven against the deployed library: one ask, one read, one forget.
3. **librarian.** `chat`, `conversation-list`, the answer mark, the fair-use notice and the waiting state. Proven by its suite and by step 4's page. Release.
4. **The factory slice.** Rooms, conversations, quota, the turn, the routes, both pages, both extension points, the migration from `agent_sessions`, the route walk. Needs the operator's ruling below. Proven by a fresh stamp with one local and one library room, driven through an ask, a refresh mid-answer, a reopen by link on another device, rename, download, delete, stop, a spent allowance, and a rooms-only account refused everywhere else. Tag.
5. **cadmus.** Takes the stamp, moves its three rooms into `config/rooms.yaml`, migrates `room_sessions`, `room_question_counts` and `room_artefacts`' key onto the factory's tables, deletes `api/rooms/` and its components, and carries the Record pane, entity links, Lately and briefings through the extension points. Proven by a colleague account on the deployed app: an old conversation reopens from its link, DASR answers, the day's count carries over.
6. **The rest.** godswood takes `chat` in job mode for a run's conversation; the library moves its scoped Milton onto the kit's driver at its re-stamp; pebblestone's personas become rooms when it takes the identity slice; every other app takes the slice at its next converge.

## Where the operator rules

**Two entries on the closed sanctioned-per-app list** in `platform/canonical-app-shape.md`: `config/rooms.yaml` (the rooms this app offers) and `frontend/src/lib/agent/app.ts` (the room page's extension point). A shared rule changes only at a sunset-review sitting, so step 4 cannot tag before one.

## Open question

**Whose identity does a persona carry onto its own app's `/mcp`?** An actor row of its own reaches the app persona-wide, outside the asker's workspace; acting as the asker keeps tenancy intact but needs the machine door to accept a person's identity, which it does not. Recommended: the actor row, zero new machinery, because a persona holds the knowledge layer rather than workspace rows. Revisit when a persona first needs a workspace-scoped table.
