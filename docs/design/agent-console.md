# Agent console

Status: **steps 1 to 3 released (factory 2026.9.57 and 2026.9.58, `@poodle64/librarian` 2026.9.22); step 4 built, with what converging cadmus onto it found (app-factory#12), its tag waiting on the sitting below and on `@poodle64/librarian` 2026.9.24's release; the asker, the tier and the writes answered 01/10/2026.** Need: radar-hooves/cadmus (Nightjar), 30/09/2026; radar-hooves/godswood#846 via Nightjar, 01/10/2026. Colleagues chat with Milton about a collection (PACMAN, DASR, any collection) and keep their conversations, in a chat that behaves as people now expect; every app that lets a person chat with an agent gets that same product from the factory.

## Decision

**A room is what a person is granted: one agent, either a local persona or Milton over named collections, entered with one `room-<id>` entitlement. The factory gives every app rooms in three layers: an imported kit, `agent-common`, that drives either agent in the one wire vocabulary both already speak; a stamped slice that binds it to the app's people (rooms, conversations, quota, the turn, the routes); and a stamped page built from `@poodle64/librarian`, which gains the conversation list and the chat controller. cadmus's rooms become three rows of `config/rooms.yaml`.** Cost: about 2,520 lines written (kit 1,050, librarian 690, the stamped slice 481 net, a library client in api-clients about 300) against about 4,400 deleted (cadmus 3,675 net, library 512, godswood 140, librarian 78): about 1,880 fewer lines of source and 1,320 fewer of tests across the estate. Each of the nine stamped apps (the eight that carry `api/agent/` today, and portcullis) carries the slice's 481 on its next converge.

The one wire vocabulary is Claude Code's own stream-json events, verbatim, plus the library's `citations`, `suggestions` and `library_error` frames. The factory's local spawn emits the first; the library's caller door emits all four; `@poodle64/librarian`'s `Transcript` folds both. Nothing translates, which is what lets one page serve both kinds of agent.

`room` is the proper name, taken from cadmus, where colleagues already hold `room-<id>` grants. It is a word for code, routes and entitlements only: the page says "Ask Milton about ADF Pay and Conditions" (`platform/canonical-app-shape.md` §Milton is a person, not a place).

## What to reach for, and why

Ruled by the operator, 01/10/2026 (godswood, with cadmus and pebblestone consulted); radar-hooves/godswood#846 is the first consumer. This is what keeps apps from spearing off in their own directions.

- **One conversational persona per app.** A second persona is justified only by a different principal or trust boundary (pebblestone's customer, staff and owner), never by a different topic.
- **Depth comes from skills and core-memory domains**, loaded on demand, not from more personas: godswood's Skippy and Taxpert fold into its one household expert.
- **A pipeline worker is not a persona.** A worker that runs unattended over a queue (godswood's Fat Controller; pebblestone's Penny, Peggy and Sally) keeps its own home, model, schema and data tier. Rooms are for people talking to an agent.
- **The harness is this slice**: a persona is a Claude Code home (the contract below), run with `--strict-mcp-config`, built-in tools denied, its environment built from nothing and `ownership.py` guarding `--resume`; the page is `@poodle64/librarian`; a question about documents goes to the library's one nameless reading engine through `reading_room` ask, never to a persona of its own.
- **Identity is the signed-in Authentik user**; the library already grants per person through actor-linked callers.
- **A household Max plan run from the server is acceptable** for a persona's turns.
- **Hard limit, not a design choice**: a document that could carry a child's name never reaches a Tier-1 (Claude) persona. It is read by a tier-3 model or the Fat Controller through a typed schema, and only the fields come back (`core.md` §Guardrails).

## The structure

```d2
vars: {d2-config: {layout-engine: elk}}
direction: right

browser: "Browser" {
  page: "routes/(protected)/rooms/[room]?c=<conversation>\n(stamped)"
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
- `Agent`: `ask(question, resume, files)` yielding events, `read(session)` returning its turns (None once it is gone), `forget(session)`. A local persona files a person's attachments under its home by conversation and names them in the question by path. `LocalAgent` is the three above; `LibraryAgent` is the library's caller door through a `library` client in api-clients, where every household service's client lives. A library room's answer mark and cited document are `LibraryAgent`'s alone, the document refused as absent outside the room's collections.

### Stamped: `api/agent/`

Bound to the app's own tables, identity and entitlements, so it is stamped and parity-gated rather than packaged.

- `rooms.py` loads and validates `config/rooms.yaml` at start (below), found under `config/paths.config_dir()` in the image as in a source checkout, whether or not the app has personas.
- `conversations.py` holds `agent_conversations`, which replaces `agent_sessions`: `id` (the slice's own, minted before the agent starts, so a stop has an address from the first second and the page's address never changes), `session_id` (the agent's own, claimed from its `init`; the library mints its only once a question leaves its queue), `user_id` NOT NULL with CASCADE (personal-subject in `db/registry.py`), `room`, `title`, `last_activity_at` (also the turn's heartbeat), `turns`, `answering_since`, `stop_requested`. `turns` is the slice's record of every question asked: when, its words as the agent was sent them, whether the agent holds an answer, and its `kind` when the page asked for something other than a plain question (a briefing), read back so a reopened briefing is carded again. The agent's transcript lists only answered questions, and the library keys its answer mark by that list's position, so a read merges the two: a question stopped before the agent took it stays in the conversation with its time, and a mark the page addresses by its own count lands on the agent's answer. `shared` lists the answers, by the page's count, the asker has shared read-only with whoever may enter the room: a place, never a copy, so a deleted conversation takes its shares with it. The slice refuses a foreign or unknown conversation with one answer, lists, renames, deletes (the agent's transcript first, then the row) and exports Markdown.
- `quota.py` holds `agent_question_counts`: one atomic upsert per question per person per local day across every room, admins exempt, `<APP>_AGENT_DAILY_QUESTIONS` (default 40, cadmus's value; 0 turns it off), the day `<APP>_AGENT_QUOTA_TIMEZONE`'s (default Australia/Brisbane), and `<APP>_AGENT_SUPPORT_URL` where a spent allowance points. The 429 carries `Retry-After`, the seconds until the local day ends, and is logged with it (`core/security-standards.md`).
- `ask.py` is the turn (below).
- `router.py`: `GET rooms`; `POST rooms/{room}/ask` (JSON or multipart, so attachments reach either agent; 404 for a conversation not this person's in this room, 409 while it is being answered, 429 once the allowance is spent); `GET rooms/{room}/conversations`; `GET`, `PATCH` and `DELETE conversations/{id}`, its export, its stop and, in a library room, `PUT conversations/{id}/turns/{n}/mark`; `PUT` and `DELETE conversations/{id}/turns/{n}/share` for a settled answer, and `GET rooms/{room}/answers/{conversation}/{n}` reading a shared one behind that room's own gate, so whoever may not enter the room is refused as the room refuses them; `GET rooms/{room}/documents/{id}` in a library room, so a citation opens; `GET quota`; the job routes unchanged. A room's routes gate on `room-<id>` through a dependency reading the path; a conversation's reach its room through the row, so a revoked grant closes a person's old conversations too.
- `jobs.py`, `jobs_models.py` and `lessons.py` are unchanged but for the driver they import.
- `app_hooks.agent_turn` and `agent_event` stand as the in and out seams; `agent_turn_settled(room, conversation, turn)` is new, for an app that files something against an answer.
- `routes/(protected)/rooms/+page.svelte` (the caller's rooms) and `routes/(protected)/rooms/[room]/+page.svelte` replace `routes/agent/[persona]`; `routes/(protected)/rooms/[room]/answers/[conversation]/[turn]` is a shared answer, read-only, the package's `Conversation` over the one stored turn with the app's own `Turn` and citations. A library room's home says how current its documents are, after what Milton answers from: `RoomRead.documents_to` is the newest date, across the room's own collections, that the library confirmed a document current (a recheck's `unchanged`, or a fetch) — when the open record was last checked, never a publication date, and null where the library genuinely does not know. The room page calls into an app-owned `src/lib/agent/app.ts` (`RoomExtensions` in the factory's `src/lib/agent/rooms.ts`, beside the `RoomTransport`): what a citation opens (`oncite`), how a question and its answer read (`Turn`, given every prop the package's `AgentTranscript` takes, to present its own or wrap the package's), what sits on a room's home (`Home`, inside the conversation's scroll under its opening), and the briefing the composer offers (`briefing`: the words asked, as kind `briefing`, and the card it reads as). The factory's copy exports nothing; `src/test/rooms` is a test app using all three, photographed in `rooms-screenshots/extended-*`. The page follows its room whenever the address changes, and a question another page hands over (`?q=`) waits in the box, unsent.
- `tests/test_route_walk.py`, stamped into every app rather than the factory's own self-test, walks the app's route table and fails any route outside the person-facing set (the caller's own record, own workspace, feedback, rooms, health) that declares no module dependency; the scaffold's example slice gates on its own module. The people list a workspace owner grants seats from answers only an account holding an entitlement other than a room's (`entitlements.require_app_module`): every account owns a personal workspace, so ownership cannot tell a colleague from a household member. That is what makes "a colleague admitted by invitation reaches exactly the rooms granted and nothing else in the app" a gate rather than a convention. A route an app holds open by design (cadmus's own sections, its support page and the Stripe webhook a signature guards) is declared in the app's own `app_hooks.OPEN_ROUTES`, path and what guards it, matched whole; the walk fails a declaration naming no route.

### `@poodle64/librarian` gains

- `./chat`: the page's controller: `open(conversation)`, `ask`, `stop`, `again`, `new`, with `turns`, `running`, `answering`, `waiting`, `quota` and `conversationId`, over a room's routes or a job's watch, message and stop. Taken from the generic half of cadmus's room page and godswood's `reader-watch.svelte.ts`.
- `./conversation-list`: newest first, reopen, rename, download, delete, new. Taken from cadmus's `PastQuestions.svelte`.
- An answer mark (helpful or not, with a note), rendered only when the host passes `onmark`, as follow-ups render only with `onsuggest`. Taken from cadmus's `AnswerFeedback.svelte`.
- `AnswerShare`, in every settled answer's footer when the host passes `onshare`: Share copies the link, a shared answer offers Copy link and Stop sharing. An app's own `Turn` places it as it places the mark. `storedTurn` makes the one turn a read-only `Conversation` shows.
- A fair-use notice, and a waiting state beside the elapsed clock `working` already shows: "Milton is answering another question first", when the agent says so.
- `history.svelte.ts`, browser-only history, is deleted once no page reads it.

## The turn, for a slow agent

Milton answers in 30 to 260 s on one GPU (median 85 s, `/media/hydrant/tmp/milton-eval/scorecard.md`), and two concurrent asks stall. So:

- The asking request streams the turn token by token, but the turn is a task in the worker, not the request. A refresh, a locked phone or a closed tab leaves it running, and its answer lands in the agent's transcript. The stream opens with the slice's own `system`/`init` naming the conversation; the agent's own `init` follows under the same name.
- `answering_since` says a turn is in flight. Reopening the conversation's link shows "still answering" with its clock and reads the conversation again when the stamp clears. The worker holding a turn refreshes `last_activity_at` every 10 s; a stamp left unrefreshed for 90 s belongs to a worker that died, and reads as not answering. A heartbeat rather than the idle timeout, because a queued library ask can run longer than any one timeout while still alive.
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

A room names exactly one of `persona` (a directory under `config/personas/`) or `library`. `room-<id>` enters it; watching a persona's jobs stays `agent-<persona>`. A library room's collections are the room's, never the browser's, and the library intersects them with the app's caller grant. A library room needs the app enrolled as a caller in the library's registry, `<APP>_AGENT_LIBRARY_URL`, and its caller credential vended through `config/vend.py`. Without the URL the app still starts, as a development backend must: it logs which room waits on it, and that room answers 503 until it is set. An app with no `config/rooms.yaml` shows no rooms, and its personas still run jobs.

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
| factory `kits/typescript/packages/librarian` | 78: `history.svelte.ts`, once unread | about 690: `chat` 260, `conversation-list` 230, the answer mark 110, fair-use and waiting 90 | +612 |
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
- **library** (§2): a collection's `child_names`, defaulting to likely and forcing `outside_models_allowed` off; at `/mcp` and `/api/caller`, a likely collection's documents and figures refused, and the reading engine's answer and `query`'s chunks from one withheld with a typed frame, then released through the Redactyl pass once the sitting rules.
- **redactyl** (§2): the store the library's pass reads the fleet's name redact-list from.
- **Authentik and yggdrasil** (§1): per app with a persona room, the persona provider and its application, and `X-authentik-jwt` on the ask route's nginx location.

## Convergence, each step proven before the next

1. **The kit.** `kits/python/agent-common` with the driver, persona and transcript lifted from `session.py`, `persona.py`, `jobs.py` and the library's `conversation.py`, and its publish job; the stamped chat and jobs import it with behaviour unchanged. Proven by the factory self-test and a fresh stamp answering one persona. Tag.
2. **The library client** in api-clients, in its own shape, and `LibraryAgent` in the kit. Proven against the deployed library: one ask, one read, one forget.
3. **librarian.** `chat`, `conversation-list`, the answer mark, the fair-use notice and the waiting state. Proven by its suite and by step 4's page. Release.
4. **The factory slice.** Rooms, conversations, quota, the turn, the routes, both pages, both extension points, the migration from `agent_sessions`, the route walk. Needs the operator's ruling below. Proven by a fresh stamp with one local and one library room, driven through an ask, a refresh mid-answer, a reopen by link on another device, rename, download, delete, stop, a spent allowance, and a rooms-only account refused everywhere else. Tag.
5. **cadmus.** Takes the stamp, moves its three rooms into `config/rooms.yaml`, migrates `room_sessions`, `room_question_counts` and `room_artefacts`' key onto the factory's tables, deletes `api/rooms/` and its components, and carries the Record pane, entity links, Lately and briefings through the extension points. Proven by a colleague account on the deployed app: an old conversation reopens from its link, DASR answers, the day's count carries over.
6. **The rest.** godswood takes `chat` in job mode for a run's conversation; the library moves its scoped Milton onto the kit's driver at its re-stamp; pebblestone's personas become rooms when it takes the identity slice; every other app takes the slice at its next converge.

## Where the operator rules

**Two entries on the closed sanctioned-per-app list** in `platform/canonical-app-shape.md`: `config/rooms.yaml` (the rooms this app offers) and `frontend/src/lib/agent/app.ts` (the room page's extension point). A shared rule changes only at a sunset-review sitting, so step 4 cannot tag before one.

**The relaxed hard limit** (§2): `core.md` §Guardrails amended so that a likely collection's free text may reach a Claude session once Redactyl has redacted it and its verify pass has released it. Ruled by the operator 01/10/2026; a shared rule changes only at a sitting, so until then the library withholds that text from every machine caller.

## The asker, the tier and the writes

Answered 01/10/2026 for radar-hooves/godswood#846. Proven means read from source at the deployed version, read from live config, or measured; a conclusion says so and what would validate it.

### 1. The asker's token reaches each run

**Every persona turn carries the asker's own Authentik identity: a short-lived token the ask request trades for the one the outpost already holds, placed in the run's environment and nowhere else.**

```d2
vars: {d2-config: {layout-engine: elk}}
direction: right

outpost: "Embedded outpost\nX-authentik-jwt: the proxy provider's\naccess token, up to 1 h left"
nginx: "nginx\nthe ask route only"
ask: "ask request\ntrades it, once per turn"
ak: "Authentik token endpoint\n<app>-persona provider"
run: "claude -p\nASKER_TOKEN in its environment"
mcp: "app /mcp · library /mcp\nuserinfo → sub → actors.yaml"

outpost -> nginx -> ask
ask -> ak: "client_assertion: the proxy token"
ak -> ask: "same person, own lifetime"
ask -> run: "run_env"
run -> mcp: 'Authorization: Bearer ${ASKER_TOKEN}'
```

1. **The outpost holds it.** On every forward-auth answer the embedded outpost (Authentik 2026.2.2, live) sends `X-authentik-jwt`: the app's proxy provider's own access token for the signed-in person (outpost source at `version/2026.2.2`: `internal/outpost/proxyv2/application/mode_common.go:43`, `oauth_callback.go:56-73`). It lives an hour (`access_token_validity: hours=1` on Godswood Proxy, live), and the outpost sets its session cookie to exactly the token's remaining life, with no refresh (`oauth_callback.go:32`), so a request carries a token with anywhere from a second to an hour left. nginx drops it today: the shared snippet forwards eight identity headers, not this one (yggdrasil `hosts/poodle64/atlas/stacks/front-door/nginx/config/nginx/authentik-location.conf:12-29`). Proven from source and live config; not seen on the wire, which needs a signed-in session.
2. **nginx forwards it to the ask route only**: `auth_request_set $authentik_jwt $upstream_http_x_authentik_jwt;` and `proxy_set_header X-authentik-jwt $authentik_jwt;` in the vhost's location for `POST /api/agent/rooms/{room}/ask`, never the shared snippet, so no other route of any app receives a bearer. Naming it in `proxy_set_header` discards a client's own copy, as it does for the eight.
3. **The ask request trades it rather than handing it on.** The proxy token is also a key to the person's whole website: the outpost accepts it as `Authorization: Bearer` (`intercept_header_auth: true` on Godswood Proxy, live) and introspects it against its own provider (`auth_bearer.go`). So before its stream opens, the ask request reads it once, logs it nowhere, and exchanges it at Authentik's token endpoint for a token from the app's persona provider: `grant_type=client_credentials`, that provider's `client_id` and scopes, `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`, `client_assertion` the proxy token. Authentik issues it for the same user (`authentik/providers/oauth2/views/token.py:414-435`), refuses an expired assertion (`:466-471`), runs the persona application's policy bindings for that person, and gives the token the persona provider's own lifetime. The outpost refuses it, since introspection matches only the issuing provider (`introspection.py:50`): the persona reaches the `/mcp` surfaces that admit the person, never the website. A refused exchange is a 401, and the page reloads through the outpost. Proven from source at the deployed tag; not driven, because driving it mints a token on a real person's account.
4. **Into the run's environment, nowhere else.** `rooms.agent` already builds a `LocalAgent` per request; it passes `run_env={"ASKER_TOKEN": token}`, which `agent_common.cli.environment` adds to the child's scratch-built environment and nothing of the app's, refusing a name that would displace the home, the CLI's credential, the gateway or `PATH`; `LocalAgent`'s repr leaves it out. The persona's home, which every asker shares, holds no token. Proven by the kit's suite through a real subprocess (the rooms slice, which passes no `run_env` yet).
5. **The persona presents it** from its `.mcp.json`: `"headers": {"Authorization": "Bearer ${ASKER_TOKEN}"}`. Measured with Claude Code 2.1.283 under `claude -p --strict-mcp-config`, a fresh, never-trusted `CLAUDE_CONFIG_DIR` and an environment built from nothing: the server received exactly `Bearer <value>`. A `headersHelper` printing the same header also ran there (the folder-trust gate that stops one in an interactive session did not apply under `-p`), but it is a shell per connection for what expansion does in place.
6. **Each `/mcp` admits the asker by `sub`.** A userinfo-gated `/mcp` keys its caller on a configured claim, falling back to `sub` (library `backend/src/library/mcp/http_auth.py:184-226`, the stamped `mcp/http_auth.py` its twin). The library's and casefile's deployments set that claim to `mcp_actor`, and a persona app's `/mcp` sets it the same way (`<APP>_OIDC_IDENTITY_CLAIM=mcp_actor`; the stamped default, `preferred_username`, would key a person on a username they may have chosen). The persona provider carries no `mcp_actor` mapping, so its token resolves to the person's `sub`, which is `users.authentik_uid` in every stamped app. One `config/actors.yaml` row per person admits them, and the server's own grants authorise: casefile joins `actor_id` onto `users.authentik_uid` and its workspace memberships (`backend/src/casefile/mcp/context.py`); the library links a caller to the actor (`admin caller_link_actor`) and reads that caller's project grants. Live, the library's callers carry two actor links, `claude-code` and `cadmus`, both machines: the library grants per person by this mechanism, and to no person yet.

**Machinery:** per app, one Authentik OAuth2 provider and application (federating the app's proxy provider, `sub_mode` the hashed user id, no `mcp_actor` mapping, bound to the app's own groups) one nginx location, and its `/mcp`'s identity claim; about 40 lines in the slice (read the header, one POST, `run_env`); per person per server, one `actors.yaml` row, and at the library a caller link with its grants. The kit's `run_env` is built. No new service.

**This settles whose identity a persona carries onto its own app's `/mcp`: the asker's.** The earlier recommendation, an actor row of the persona's own, is withdrawn for a room turn: acting as the asker keeps tenancy whole, and the door does accept a person, by `sub`, as casefile's already does. The app's `/mcp` resolves the asker as casefile's does, one per-call door that binds the session to the asker's workspace (§3). A persona's own actor row stays for a job, which has no asker's request to take a token from. A library room is unchanged: `LibraryAgent` presents the app's own caller credential, and the room is the grant.

**Open:** the persona provider's lifetime, concluded at 30 minutes (the slowest measured turn is 260 s; a local persona's tools add more), to be validated against the longest real turn.

### 2. The hard limit, per room

**Ruled by the operator, 01/10/2026, relayed by master-orchestrator through Nightjar; AWAITING the next sitting's ruling, because `core.md` §Guardrails still reads "never into a Claude session" and binds until the sitting amends it. Until then the release below is off, and a likely collection's text is withheld from every machine caller.** His words: "balance consequence and likelihood with risk ... let's not degrade why we want to use AI."

The exposure is the reading engine's free text. `outside_models_allowed=false` decides which model reads (library `backend/src/library/api/registry/service.py:1447-1463`), not who receives what it wrote. Nothing an app holds sees that text first: a persona's tool results reach its CLI straight from the library, before the slice's `agent_event` hook sees an event. The library is the one process that sees the text before a persona does, so the limit lives there.

- **The likelihood is one attribute on the collection's profile, beside `outside_models_allowed`:** `child_names`, `unlikely` or `likely`. Policies and manuals are unlikely; household admin, school and medical are likely. A new collection defaults to likely, and each existing one is classified once by its owner. Likely forces `outside_models_allowed=false`, so the reading itself stays on the household model. A misconfigured room cannot bypass it: the room names collections, and the attribute is read where the collection lives, for every caller.
- **At the library's machine doors (`/mcp`, `/api/caller`), the reading engine's answer and `query`'s chunks drawn from a likely collection pass through Redactyl** with the fleet's persistent name redact-list (live: 12 name terms), and leave only when Redactyl's fail-closed verify releases them. **A verify failure withholds the text:** the caller gets a typed withheld frame saying why, never the text. A likely collection's whole documents and figures (`management` `document_content`, `document_figure`) are refused at a machine door outright. The human Console's door is exempt: a person reading is not a Claude session.
- **Every machine caller meets it, not only a persona.** The library has no caller tier to key on (`Caller` carries none), and a persona is indistinguishable from a service there. That includes the operator's own Claude sessions, which reach the library as the admin caller `claude-code` (live), and it is what the guardrail says. A service that shows a likely collection to a person and needs it unredacted is when a caller flag is argued, not before.
- **Typed fields stay the stricter path:** the Fat Controller reads the documents themselves on the household box through its schema and never needs the library's free-text door.

Chosen over the room's own collection list, which is app config and the thing a misconfiguration breaks, and over the grant, which decides reach, not tier, and serves a person on the Console as much as a persona.

**Machinery:** in the library, one profile field with its default and one validation, the pass at two doors with its withheld frame, and the refusal on two document reads; Redactyl, as its other consumers use it. No new service.

**Open:** which term store the library's pass reads is Redactyl's to say (the fleet list is its MCP container's `/data/terms.yaml`; its REST surface reads per-consumer stores under `REDACTYL_API_TERMS_DIR`); the classification of the existing collections, by their owners; the sitting's ruling.

### 3. Write tools

**The gate is the app's `/mcp`, server-side, on every call, on the asker §1 resolved. A skill or a `settings.json` allow-list steers a persona; neither fences it.**

- **One door per call.** The stamped `/mcp` takes casefile's `mcp/context.py`: the bearer gate admits the caller, and `run_scoped` looks the asker up by `users.authentik_uid` and binds the session to their workspace, refusing a caller with no user row. A tool writes through that door or not at all.
- **The entitlement, per call.** A write tool refuses unless the asker holds the module it writes to, by the check the HTTP routes make (`entitlements.has_module`). The entitlements come from the userinfo claims the bearer gate already fetches, evaluated live on each call (`authentik/providers/oauth2/views/userinfo.py:67-92`), which the persona provider fills with the app's own application's entitlements, as the proxy's mapping fills `X-authentik-entitlements`; the gate passes them on in a header only it writes, stripping a caller's own copy first, as it does for `x-client-id`.
- **Few:** a write tool exists only where a person would otherwise make that write by hand in the app, one tool per such write, each logged with the asker and the room.
- **Never handed to a persona:** the app's own credentials (the database, the OIDC secret, its library caller credential, anything vended), which the kit's scratch-built environment already keeps out (`agent_common/cli.py`, `_INHERITED_IF_SET`); the proxy token, a key to the website (§1); a tool that grants or revokes, admits or removes a person or a workspace, changes an entitlement or a role, or deletes in bulk; a tool that mints, reads or rotates a credential; a tool that sends in a person's name (mail, a payment, a publication), since the persona drafts and the person sends; Claude Code's built-in shell, file-write and web tools, denied by the ruling above; and a likely collection's text beyond §2's pass.

**Machinery:** casefile's `mcp/context.py` into the stamped `/mcp` (moved, not written; casefile drops its copy at its next converge), about 10 lines in the bearer gate for the entitlements header, one scope mapping on each persona provider, and a module check in each write tool.

**Open:** which writes godswood's household expert holds is godswood's list, under these rules.

## Open questions

- The persona provider's lifetime (§1), concluded at 30 minutes.
- The term store the library's Redactyl pass reads (§2), Redactyl's to say.
- The sitting's ruling on the relaxed limit (§2); until it rules, a likely collection's text is withheld from every machine caller.
