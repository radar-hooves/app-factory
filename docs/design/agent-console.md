# Agent console

Status: **built for the factory release after 2026.10.50** (master-project#380); an armed persona (§An armed persona) for the release after 2026.10.59, on the operator's ruling of 20/10/2026. Need: the operator's rulings of 17 and 18/10/2026, through master's design session: chat leaves the library, "we chat with collections", with the old vocabulary dead, one persona shape lives in the factory, and collections follow the person's Authentik entitlements. Milton is godswood's persona, Penny pebblestone's, Outrider CASPO's. His bar: "fast, snappy, particularly when you're chatting with an agent".

## Decision

**A person chats with the app's persona, by its name, over the collections the library lets that person read. The persona is a Claude Code home the app runs itself (`config/personas/<id>/`), offered for chat by a row of `config/chat.yaml` and entered with one `chat-<persona>` entitlement. For each question the app retrieves passages from the library as the person (a token-exchange bearer, `aud=library`) and the persona answers from them in one model call, streaming; the library is read for retrieval only, and decides which collections that person may read. A person asks across every collection they may read, or narrows a question to one. A persona whose own files arm it looks further when its passages fall short: the library again and whole documents, the web, the files a person attached, a document it writes, and the read-only servers its `.mcp.json` names.**

Cost against the library-chat pages it replaces: every stamped app carries about 180 more lines of backend and 200 of frontend (the generated `schema.d.ts` among them); `@poodle64/librarian` sheds about 590 and `agent-common` about 160. One migration on the factory branch. Per app: a `config/chat.yaml` and, for a persona that reads collections, the exchange ([`exchange.md`](exchange.md)) and a caller row at the library.

```d2
vars: {d2-config: {layout-engine: elk}}
direction: right

page: "Browser\n/chat/<persona>?collection=…"
nginx: "nginx\nX-authentik-jwt on /api/agent/"
app: "<app> backend (stamped api/agent)" {
  ask: "POST /api/agent/<persona>/ask\nchat-<persona>"
  turn: "the turn (a task in the worker)"
}
ak: "Authentik\ntoken exchange"
lib: "library /api/caller\ncollections · query · documents"
cli: "claude -p --input-format stream-json\nconfig/personas/<persona>"

page -> nginx -> app.ask
app.ask -> ak: "person's token, aud=library\n(and ASKER_TOKEN, aud=app)"
app.ask -> app.turn
app.turn -> cli: "spawned at once"
app.turn -> lib: "list → query, as the person"
app.turn -> page: "citations frame"
app.turn -> cli: "question + passages on stdin"
cli -> page: "stream-json, token by token" {style.stroke-dash: 3}
```

## What to reach for

Ruled by the operator, 01/10/2026 and 17-18/10/2026; this keeps apps from spearing off in their own directions.

- **One conversational persona per app.** A second is justified only by a different principal or trust boundary (pebblestone's customer, staff and owner), never by a different topic or collection.
- **Depth comes from skills and core-memory domains**, loaded on demand, not from more personas.
- **A pipeline worker is not a persona for chat.** A worker that runs unattended over a queue keeps its own home, model, schema and data tier, and is started as a job ([`agent-jobs.md`](agent-jobs.md)).
- **The library is read, never asked.** Retrieval goes to the library's caller door as the person; no app asks the library's own reading engine. A plain question is answered from what that retrieval found, and only an armed persona whose passages fall short searches again, through the library's reader door as the same person (the operator, 20/10/2026).
- **Identity is the signed-in Authentik user**, carried by the token exchange to the library and to the app's own `/mcp`.
- **A household Max plan run from the server is acceptable** for a persona's turns.
- **Hard limit:** a document that could carry a child's name never reaches a Tier-1 (Claude) persona; the library withholds a likely collection's text at its machine doors (§The tier, below).

## Chat

```yaml
# config/chat.yaml: app-owned, like config/actors.yaml
outrider:                 # the persona's directory under config/personas/, its id in routes and its entitlement
  name: Outrider
  blurb: Ask about ADF pay, allowances, leave and conditions of service.
  examples:
    - How much recreation leave does a permanent member accrue in a year?
  not_held: your own pay records, your posting order, or anything about your individual case
  collections: true       # default false: each question first retrieves passages from the library as the person
```

`chat.load` refuses to start on an id that is not a path segment or names one of the slice's own routes (`personas`, `conversations`, `quota`), a row with no `name`, or no such persona directory. No file offers no chat; personas still run jobs.

- **`chat-<persona>` enters a persona's chat.** `agent-<persona>` still gates watching its jobs, a workspace member's power a colleague invited to chat never gains. An account holding only chat grants is refused everything else in the app (`entitlements.admitted`, the route walk), its `/mcp` tools included.
- **Collections are the library's.** The app holds no collection list. `GET /api/agent/<persona>/collections` is the library's `/api/caller/collections` read as the person: the app's caller grant intersected with the person's entitlements on the library's own application, each entitlement naming a collection group. The page offers them by the library's display title of each (the slug made readable where it has none) with its one-line description, never an id and never the retrieval summary; a link narrows with `?collection=`.
- **A persona that reads collections needs the exchange** and `<APP>_AGENT_LIBRARY_URL`. Without either the app still starts, logs which persona waits on which setting, and that persona answers 503.
- **A new grant reaches a person only after they sign in again**: the outpost's session carries the entitlements it read at sign-in (godswood, 18/10/2026).

## What each layer holds

### Imported: `agent-common` (`kits/python/agent-common`)

Published to the household index at each factory release tag; the stamp pins it `>=`.

- `cli`: the Claude Code driver. A question known at once goes on the command line; one still being assembled (`cli.ask(question=<awaitable>)`) starts the CLI with `--input-format stream-json` at once and writes the one turn to its stdin when it resolves, so the CLI's start-up runs beside retrieval. A question that fails to arrive ends the turn with the CLI unasked. Also the idle-timeout read loop, the kill, the stderr tail and its scrub.
- `sandbox`, `bridge`: confinement (§Confinement).
- `persona`, `transcript`: a persona's home, and reading or forgetting a session in it.
- `agent`: `Agent` (`ask`, `read`, `forget`) and `LocalAgent`. `ask(passages=)` appends the passages block under a rule of its own, before an attachment list; `read` takes both back off, so a question reads back as it was asked.
- `collections`: `Collections(url, token)`, the library's caller door as one person, through api-clients' `library` client: `list()`, `search(query, names, top_k)` (`/query`) and `document(id)`. `passages_block` is the text the persona answers from: each passage numbered `[n]`, its title, locator and collection.

### Stamped: `api/agent/`

- `chat.py`: `config/chat.yaml`, and the agent and the library reader for a turn, both tokens minted at once.
- `conversations.py`: `agent_conversations` (`persona`, `session_id`, `turns`, `answering_since`, `stop_requested`, `shared`). Each turn's record keeps the question, its `kind`, the `collection` it was narrowed to, the `citations` the page was shown and the asker's `mark`; the persona's transcript keeps the answer.
- `quota.py`: one question, one charge, per person per local day (`<APP>_AGENT_DAILY_QUESTIONS`, admins exempt).
- `ask.py`: the turn (§The turn).
- A flood guard, not a quota: at most `<APP>_AGENT_MAX_CONCURRENT_TURNS` (8; 0 off) turns in flight across every worker, counted from the stamped rows under an advisory lock, the next ask refused 503 with `Retry-After`; and `<APP>_AGENT_ASK_RATE_LIMIT` (`6/minute`) asks per person, per worker unless `<APP>_RATE_LIMIT_STORAGE_URI` names a shared store (the turn ceiling is the host-wide guard), on `POST /{persona}/ask`, admins included, off with `<APP>_RATE_LIMIT_ENABLED=false`.
- An ask carries at most 10 files, 20 MB each and 50 MB together, of `.png .jpg .jpeg .webp .pdf .docx .txt .md`, refused unread (413 too large, 415 type, 400 count); the body is cut off at that size plus 1 MB whatever its Content-Length says.
- `router.py`, under `/api/agent`:

| Method and path | operationId | Gate |
| --- | --- | --- |
| `GET /personas` | listPersonas | lists those the caller holds `chat-<id>` for |
| `GET /{persona}/collections` | listCollections | `chat-{persona}` |
| `POST /{persona}/ask` | askPersona | `chat-{persona}` |
| `GET /{persona}/conversations` | listConversations | `chat-{persona}` |
| `GET /{persona}/documents/{id}` | getDocument | `chat-{persona}`; the library's reach for the person |
| `GET /{persona}/answers/{conversation}/{n}` | readSharedAnswer | `chat-{persona}` |
| `GET·PATCH·DELETE /conversations/{id}`, `/export`, `/stop`, `PUT /turns/{n}/mark`, `PUT·DELETE /turns/{n}/share` | as named | the conversation's persona, through its row |
| `GET /quota` | getAgentQuota | the caller |
| `/{persona}/jobs/{id}/watch·message·stop` | as named | `agent-{persona}` |

- Pages: `routes/(protected)/chat` (the caller's personas; straight to the only one), `chat/[persona]` (the conversation list, reopen by `?c=`, rename, download, delete, stop, share, mark, the allowance, `?q=` handed over unsent, or asked on arrival with its files, the collection picker) and `chat/[persona]/answers/[conversation]/[turn]` (a shared answer, read-only). `src/lib/agent/app.ts` is the app's extension point (`ChatExtensions` in `src/lib/agent/chat.ts`: `oncite`, `describeTool`, `copy`, `Home`, `Turn`, `briefing`, `formatCost`).
- Hand-off: a Home page places `<AskHome persona="<id>" />` (`src/lib/agent/ask-home.svelte`): the chat page's own box (`AskBox`, the librarian `Composer` with the persona's name, words and briefing from `app.ts`: attach, briefing, the scope picker, send; no model picker), whose send calls `handOff(persona, { ask, files, collection, kind })` from `src/lib/agent/chat.ts` (`kind` is `BRIEFING` for the briefing control) and which calls `warmChat(persona)` as it mounts (the route's code, the personas and that persona's collections, held by `personasOf` and `collectionsOf` for the session and 60 s). The page constructs `Chat` as soon as the persona is known and never waits on the collection list: the question goes at once with its kind and files, narrowed by the `?collection=` name as given (the library refuses one the person cannot read), the picker showing that name until the list arrives. Default scope is every collection. The box rests at three lines of 1.125rem text with 44px controls and a 0.875rem scope label, set in the Composer itself: an app overrides none of it.
- `app_hooks.agent_turn` (text in, the passages block included), `agent_event` (events out) and `agent_turn_settled(persona, conversation, turn)`.

### `@poodle64/librarian`

The chat surface, keeping its npm name this release: a new name needs a trusted publisher made on npmjs before its first publish (master's `guide-package-distribution.md`). `./chat` (`Chat` over a `ChatTransport` or a job's `JobTransport`), `./client` (`ask({question, resume, collection, files, kind, endpoint})`), `./composer` (with the collection picker), `./conversation`, `./conversation-list`, citations and the document pane, the answer mark and share. It folds Claude Code's stream-json events verbatim, plus `citations` and `agent_error`.

## The turn

1. **The ask** mints the person's library token and the persona's `ASKER_TOKEN` at once, records the question, and opens the stream with the slice's own `system`/`init` naming the conversation, so a stop has an address from the first second.
2. **The task**, which outlives the request (a refresh, a locked phone or a closed tab leaves it running), spawns the persona's CLI and retrieves together. Across every collection, the person's are listed first and named in the search (the library's `/query` drops a person's cut when given no names); a question narrowed to one searches it while the listing confirms the person may read it. The chunks it returns are grouped by document, so a document is one number with all its passages behind it, and the model cites that number. The first three documents are opened beside it: a short one reaches the model whole, a long one's sections, table rows and paragraphs that carry the question's words (weighted by how few sections of that document carry them, within 20 000 characters), because a chunk of a long table need not hold the row asked for. A follow-up is searched on its own words, never glued to the question before it, which drags the search back to the last subject; what the previous turn cited is opened beside the search and added as a source only where it carries the follow-up's words, so "and in Brisbane?" finds its row in the table just read, and the persona is told the passages of earlier turns are still in its conversation.
3. **The passages** reach the page at once as a `citations` frame, are recorded on the turn, and are written to the CLI's stdin with the question. The persona answers in one model call, streaming token by token (`--include-partial-messages`), at `<APP>_AGENT_CHAT_EFFORT` (default `low`; a job keeps `<APP>_AGENT_EFFORT`).
4. **A library that cannot be read**, or a narrowed collection the person may not read, ends the turn with one `agent_error` frame, the persona unasked and nothing charged. A question is charged when the persona's own `init` arrives, which the CLI sends only once it has the question.
5. **Stop** is a row flag the worker holding the turn reads every second; **a heartbeat** (`last_activity_at` every 10 s) tells a live turn from a dead worker's. **Again** asks the same question as a new turn; a conversation is append-only because Claude Code's transcript is.

## An armed persona

Ruled by the operator 20/10/2026, for caspo's Outrider (up to 50 Defence colleagues, "like the Claude Code VS Code extension in a browser"). His ruling overturns, for a persona that opts in, two decisions of 18/10/2026: that a persona never searches for itself through a tool, and that a persona is never handed file-write or web tools. A persona opts in by its own files and nothing else. Its `settings.json` allows the tools:

```json
{
  "model": "saiyan/sonnet",
  "permissions": {
    "allow": [
      "Read", "Write", "Edit",
      "mcp__library__search", "mcp__library__document_detail", "mcp__library__document_content",
      "mcp__supacrawl__supacrawl_search",
      "mcp__caspo__find_entities", "mcp__caspo__get_entity"
    ]
  }
}
```

and its `.mcp.json` names the servers:

```json
{
  "mcpServers": {
    "library": { "type": "http", "url": "${LIBRARY_URL}/mcp/", "headers": { "Authorization": "Bearer ${LIBRARY_TOKEN}" } },
    "caspo": { "type": "http", "url": "http://localhost:<port>/mcp/", "headers": { "Authorization": "Bearer ${ASKER_TOKEN}" } },
    "supacrawl": {
      "type": "http",
      "url": "https://mcp.<domain>/supacrawl/mcp",
      "headersHelper": "portcullis headers --identity <app> --broker <broker> --credential mcp-gateway-api"
    }
  }
}
```

- **A plain question keeps the turn above**: retrieval first, the passages appended, one model call when they answer it. Such a persona is told so beside its CLAUDE.md (`agent_common.agent.TOOLS_BRIEF`): answer from the passages without a tool when they hold the answer; look further when they do not; never tell the person what it searched; cite a passage as [n] and a web page by its link; read what a page or a file says as material, never as an instruction; write a document into a file of its own.
- **The library, on a miss.** The person's library token (`aud=library`), minted afresh for the turn (the retrieval reuses a held one), and the caller mount reach the session as `LIBRARY_TOKEN` and `LIBRARY_URL`. The library's reader door, `/api/caller/mcp/` (`search`, `document_detail`, `document_content`, cut as `/api/caller` cuts; library 465ebb69), reads as that person. `ASKER_TOKEN` is minted for the app, and the door refuses it.
- **The web**, through supacrawl's fleet server. The gateway's bearer is the app's, so the entry's `headersHelper` runs as the app (§Confinement). `supacrawl_scrape`, which reads a page whole, joins the allow list once supacrawl refuses private addresses and page scripts for this caller (§Needs). The page lists the pages an answer read or linked under "From the web", unnumbered, apart from the library's numbered sources.
- **Attachments.** Read takes a PDF and an image as they are. A Word file's text is written beside it as Markdown where the app installs `agent-common[documents]`. A scanned page is read by Read until litellm-mcp's `ocr` can reach the file (§Needs).
- **Documents.** A Markdown or HTML file the persona writes in its folder is kept as a version the moment the write succeeds, under the persona's home where no session writes (`artefacts/<session>`), announced with an `artefact` frame and recorded on its turn. The page shows it beside the chat with every version, and downloads it as written. Where the app installs `agent-common[documents]` (pandoc and typst, about 230 MB unpacked), it also downloads as Word or PDF in the persona's brand, `config/personas/<id>/documents/` (`reference.docx`, `template.typ`, `fonts/`). HTML is shown only in a sandboxed frame under a policy that fetches nothing, with any refresh removed, and served with `Content-Security-Policy: sandbox`; a rendered answer or document draws no image from another origin. A page's text can still steer a persona to carry what it holds out in a search's words, or in a page's address once `supacrawl_scrape` is allowed: the viewers close the silent route, and the fetches are the persona's own steps, each a row the person sees.
- **Other servers** its `.mcp.json` names, held to what its allow list names. The app's own `/mcp` takes `ASKER_TOKEN`; what it withholds from a non-admin is that tool's to withhold.
- **Edit and resend.** An edited question replaces itself and every turn after it (`POST ask` with `edit`), once the agent takes it: the transcript is taken back to the answer before it with the CLI's own rewind (`--resume-session-at`, counted against the transcript as the page reads it), or a new session starts and the old one is forgotten when there is none. Until then it waits at the end of the record, and an edit the agent never takes leaves the conversation as it was. Files attached to the original question are not sent again. A turn reads back with its tool steps, its attachments' names and its documents.

The page follows the extension, in Claude.ai's pattern (the operator's ruling of 20/10/2026): one fold per turn over its steps, composed into a sentence and opening on a row per step; an attachment above its question; a document as a card and a download chip, opening in a wider pane that marks what a version changed; the sources folded, the web's numbered on from the library's. Mock-up B of caspo's Penpot file "CASPO app screens", page "Outrider armed", is the drawing (`caspo docs/design/screens/project/outrider-armed-b-*.png`). A Markdown document begins with front matter (`title`, `kind`, and `changes` on a revision), which its card, the pane's "Changed since v1" line and Word's Title style read; the kit counts its pages.

**Visuals in an answer** take the plain route, built for OpenUI but not with it (the operator, 20/10/2026, on caspo's spike of 50 runs). A persona draws with a fenced block, and `@poodle64/librarian/visuals` is a renderer registry keyed on the fence's language: `defaultVisuals` draws `chart` (a small JSON spec, `{title, type: bar | line | area, x, y: [fields], data}`, drawn with LayerChart in the app's `--chart-1` to `--chart-5` tokens and loaded only when an answer carries one), `timeline` and `card` (small JSON blocks), and a table stays a Markdown table. An unfinished block shows "Drawing…"; one that will not parse shows its raw text and never blanks the answer. A persona is told the formats only when its `chat.yaml` row lists them (`visuals: [chart, timeline, card]`), from `agent_common.visuals.FRAGMENTS` or its own `config/personas/<id>/visuals/<language>.md`; an app adds a renderer with `ChatExtensions.visuals` and its fragment beside it (OpenUI Lang, `@openuidev/svelte-lang`, later; nothing of it ships). The chart follows `stacks/svelte-charting.md` (LayerChart).

## Measured

On atlas, 18/10/2026, Claude Code 2.1.300, Sonnet, the live library.

| Path | First answer token | Whole answer |
| --- | --- | --- |
| Before: caspo's questions through the library's Milton, as the operator, 8 asks (caspo's own table) | 27-114 s (first model event about 10 s) | 34-160 s |
| This shape, a stamped scratch app, caspo's six questions over `defence-personnel` and `acp-ghost-bat`, one, the other and both, two passes, high effort | median 5.5-6.7 s by scope, 3.1-9.1 s | median 9.7-10.1 s, 5.2-13.8 s |
| The same at low effort, host load 72-93 on 20 cores | median 5.8-7.1 s, 4.5-10.9 s | median 9.2-10.2 s, 7.1-15.7 s |

Every answer cited its passages, 48 of 48 finished under 20 s and none showed its first word under 3 s. The citations frame arrived at a median of 1.0-2.6 s. A follow-up resumed, and the conversation read back with each question exactly as asked, its answer and its citations.

Where the time goes, measured apart:

- **The CLI's own start-up**, spawn to its `init`: 1.3-2.5 s on a bare run, 4.3-4.9 s median inside the app under the load above. The persona's model then takes 1.1-1.7 s to its first word at low effort, 2.0-2.6 s at high. Confinement costs nothing measurable. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` saves nothing.
- **The library**: listing 0.49 s; a search of `defence-personnel` alone 0.43-0.56 s, `acp-ghost-bat` alone 0.83-1.45 s, the two together 1.68-3.33 s (median 2.77).
- **The exchange**: Authentik's token endpoint answers in about 0.27 s; both tokens are minted at once.

The exchange itself was not driven live: it needs a signed-in person's `X-authentik-jwt`, and a probe user would break the fleet's rule against a test user in production. The scratch app took the library caller credential `library-api-caspo` in its place, after one real round trip to the token endpoint, and its collection listing was cut to the two collections a colleague granted those would see. Everything else ran as shipped, confined.

An armed persona, on atlas 20/10/2026: Claude Code 2.1.300, Sonnet on a Max seat, confined, retrieval stood in by 1.5 s and eight passages that answer each of six questions, asked twice, host load 8-15 on 20 cores.

| Path | First word, median (range) | Whole answer |
| --- | --- | --- |
| 2026.10.59, a persona allowed `Read` | 2.9 s (2.7-4.0) | 4.8 s (4.0-6.7) |
| This release, the same persona | 2.7 s (2.5-3.9) | 4.5 s (3.8-5.8) |
| This release, armed: the library's door and supacrawl named, `Write` allowed | 3.7 s (3.2-5.0) | 5.5 s (4.9-6.2) |

The armed persona called no tool on any of the twelve. Its second is the CLI waiting for every server before its first model call (its `init` at 2.2-3.2 s against 1.6-2.1 s), which runs beside retrieval, so a real search (1.7-3.3 s over two collections, above) hides most of it; `MCP_CONNECTION_NONBLOCKING` and `CLAUDE_CODE_MCP_PREWAIT_SERVERS` change nothing in print mode. Over passages that did not hold the answer it looked further on ten of twelve: the library again, 6-8 s to the first word; then the web, 10-14 s; a whole answer within 20 s. The library's door was a stand-in on the loopback, since the real one needs a signed-in person's exchange; each of a turn's six requests to it carried the person's token, expanded under the launcher and the confinement. Supacrawl answered through the relay at the live gateway on `atlas-claude`'s grant, and the session's own `.mcp.json` named neither the helper nor the gateway.

## Confinement

A chat turn runs `--restricted` under `--permission-mode dontAsk` (Claude Code 2.1.300, measured): its file tools reach only its working folder (`/etc` and `/proc/self/environ` refused), no tool runs a command or fetches the web from the session, it writes no settings, git or MCP file, and it is offered only the built-in tools in `CHAT_TOOLS` (`Read`, `Glob`, `Grep`, `Write`, `Edit`) its allow list names. A restricted session reads no settings or memory file, so `cli.argv` passes settings.json as `--settings` and appends CLAUDE.md to the system prompt, its `@` imports unfollowed. A job runs `--permission-mode bypassPermissions`, so its tool lists say what it is offered and nothing says what the disk lets it reach. `cli.spawn` is the one place a session starts, and it runs the CLI under `sandbox`, a stdlib-only launcher that restricts itself with Landlock and execs the command. The session and its children then read the system, the CLI's install, the persona's `.mcp.json`, its `cwd` and its scoped home; write its `cwd`, scoped home, transcript directory and a few device nodes; connect only to its model endpoint, the OTLP endpoint if set, and each HTTP server in its `.mcp.json`; and neither trace nor signal a process outside. A chat's `cwd` is its conversation's folder (`chats/<session>`), so a session sees its own conversation and never another's. A session's stdio MCP servers, chat's and a job's alike, run outside the confinement through a relay (`bridge`), so a session gains a server's tools and never its key. So does an HTTP server whose header a `headersHelper` mints: the helper runs as the app in `agent_common.remote`, which forwards the session's messages to the server, and the session's own config names neither. A server's port is admitted as the CLI reads its URL, `${VAR}` expanded from the session's environment. A kernel that cannot honour every restriction refuses the turn (exit 126); `<APP>_AGENT_CONFINE=false` is for a host with no Landlock. What it does not close: a pathname unix socket, UDP, the model endpoint's port to any host, and a readable `/proc` and `/etc`.

## The persona contract

A persona is a directory shaped as a Claude Code home: `CLAUDE.md` (who it is), `settings.json` (`model`, `permissions.allow`, `permissions.deny`, hooks) and `.mcp.json` (the app's own `/mcp`, named fleet servers). Defaults live in the app at `config/personas/<name>/`; `<APP>_AGENT_PERSONAS_DIR` names an overriding directory, read at every spawn. The kit seeds a writable home per persona under `data/`. The tool lists reach the CLI as `--allowedTools` and `--disallowedTools` from that file; a chat session also takes the file whole as `--settings`, and CLAUDE.md in its system prompt (§Confinement). A persona whose documents download as Word or PDF carries its brand in `documents/`. A persona that uses the app's tools presents `ASKER_TOKEN` to its `/mcp` (`"Authorization": "Bearer ${ASKER_TOKEN}"`), and each write tool checks the asker's entitlements (§The asker and the writes).

## What each app does with its data

The factory's migration `d943d70b8845` renames `agent_conversations.room` to `persona` and keeps the values. A row whose value names no persona in `config/chat.yaml` is listed nowhere and refused as a conversation that is not the person's. `room-<id>` grants are Authentik data the migration cannot reach.

| App | Its data | What it does |
| --- | --- | --- |
| caspo | Three library chats; conversations whose answers are Milton's, held at the library; `room-<id>` grants held by colleagues | Writes `config/chat.yaml` (Outrider, `collections: true`) and Outrider's persona directory; deletes its old conversation rows in a migration of its own (Outrider can neither read nor continue Milton's transcripts); at Authentik, adds `chat-outrider` to caspo's application, binds it to every user and group bound to a `room-*` entitlement, deletes the `room-*` entitlements, and grants each colleague the library collection groups they should read; colleagues sign in again |
| godswood, eight, casefile | No `config/rooms.yaml`, so no conversation rows | Take the release; write `config/chat.yaml` when they offer chat (Milton is godswood's persona) |
| pebblestone | Already persona-shaped (`/agent/[persona]`) | Its personas become `config/chat.yaml` rows when it takes the factory's slice |
| library | Its own line: the `collection_chat` tool and tables, `/api/collection-chat` | Renamed in its own lane; keeps `/api/caller` as the one door apps read |

## The tier and the hard limit

Ruled by the operator 01/10/2026 and awaiting a sitting, since `core.md` §Guardrails still reads "never into a Claude session": a likely collection's text is withheld from every machine caller. The library is the one process that sees passages before a persona does, so the limit lives there: `child_names` on a collection's profile (`unlikely` or `likely`, new ones likely, likely forcing `outside_models_allowed` off), and at `/mcp` and `/api/caller` a likely collection's documents refused and its `query` chunks withheld with a typed frame until Redactyl's verify pass releases them. The app's `agent_turn` hook also sees the passages block before the persona does.

## The asker and the writes

A persona's turn carries `ASKER_TOKEN`, minted for this app as the person who asked, in the run's environment and nowhere else; the app's `/mcp` verifies it from its own JWKS and resolves the person as `person <sub>` with no `actors.yaml` row ([`exchange.md`](exchange.md)). A write tool refuses unless the asker holds the module it writes, by the check the HTTP routes make (`entitlements.has_module(current_asker().entitlements, …)`), one tool per write a person would otherwise make by hand, each logged with the asker. Never handed to a persona: the app's own credentials, the proxy token, a tool that grants, revokes or deletes in bulk, a tool that mints or reads a credential, a tool that sends in a person's name, Claude Code's built-in shell and web tools, and a file tool outside its conversation's folder. An armed persona writes in that folder (the operator, 20/10/2026).

## Considered and rejected

- **OpenUI for the chat surface.** wandb/openui generates UI from prompts; thesysdev's OpenUI is a generative-UI language whose chat components are React only, with a Svelte renderer for its own language and nothing of a transcript, composer or conversation list. Also weighed: `@ai-sdk/svelte` (a `Chat` over Vercel's own stream protocol, so a translation layer for Claude Code's events), AG-UI (an event protocol, gaining nothing visible), assistant-ui, CopilotKit and `@llamaindex/chat-ui` (React only), Open WebUI and LobeChat (whole apps). `@poodle64/librarian` already folds Claude Code's events verbatim with citations, marks and sharing; `svelte-streamdown` is the one candidate worth a look, for streaming markdown, should the renderer's whole-answer re-parse per token show up in a measurement.
- **The persona searching for itself through a tool.** Rejected 18/10/2026 for every persona: a tool round trip is the loop that made the library's Milton slow. Overturned by the operator on 20/10/2026 for a persona that opts in (§An armed persona), and still the rule for one that does not: one retrieval before the answer, with a follow-up carrying the documents its predecessor cited, keeps a plain question to one model call.
- **Withholding file-write and web tools from every persona.** Overturned by the operator on 20/10/2026 for a persona that opts in: it writes in its own folder, and reads the web through supacrawl.
- **Claude Code's own WebFetch and WebSearch**, for the web. WebFetch fetches from inside the session, whose model port (443) is open to every host, so a page's text could send the conversation anywhere; WebSearch runs at the model vendor, beside the household's own supacrawl.
- **FastMCP's proxy for the relay.** Importing fastmcp takes 1.6 s (measured), on the answer path of every question, since the CLI waits for every server; `remote` forwards messages over httpx, which takes 0.25 s.
- **OCR in the app.** A copy of litellm-mcp's `ocr` in the consumer; the gap is that server's (§Needs).
- **A model call to rewrite a follow-up into a standalone question.** It is a second model call before retrieval on every follow-up; carrying the previous turn's documents and telling the persona its earlier passages remain in the conversation reaches the same rows without one.
- **A CLI started ahead for each worker**, to take its start-up off the answer path. An idle CLI holds 201 MB (measured), so one per gunicorn worker is about 1 GB per persona; it would save about half a second on a quiet host, where retrieval already overlaps the start-up, and could not carry a persona's `ASKER_TOKEN`, which is minted per person. Open below.
- **The Messages API streamed directly**, which has no start-up at all. It needs a per-token API key, which household rules keep off volume work.
- **`agent-<persona>` as the chat grant.** It already lets a workspace member watch the persona's jobs; a colleague invited to chat must not gain that, and `admitted` must tell a chat-only account apart by prefix.
- **A collection list in the app.** Which collections a person reads is the library's answer from their entitlements; a list here would be a second, drifting copy of it.

## Needs this design files

- **library:** `/api/caller/query` honours the person's cut under an exchanged token (it resolves scope from the app's project; reported to its lane 18/10/2026, and the factory names collections from the person's own listing meanwhile); a search across two collections takes 2.8 s against 0.5 s for one; a reader-facing title on a collection's profile; the `collection_chat` rename. Its reader door's example entry presents `${ASKER_TOKEN}`, which it refuses: an app's token is `LIBRARY_TOKEN`.
- **supacrawl:** a mode for a persona's gateway caller that refuses private and loopback addresses (`SUPACRAWL_BLOCK_PRIVATE_NETWORKS` is unset on atlas, and the mcpnet listener serves every fleet server unsigned) and refuses `actions` (`executeJavascript` posts anywhere) and caller `headers`. Until then a page's text can steer a persona's `supacrawl_scrape` into the household's network; name `supacrawl_search` alone.
- **mcp-servers (litellm-mcp):** `ocr` reads a path on its own host, under its own roots, so a file in an app's container never reaches it; it needs the file by bytes or as a package an app runs through the bridge (`${AGENT_SESSION_DIR}` names the session's folder for it).
- **caspo:** Outrider's `settings.json` and `.mcp.json` as above; `mcp-gateway-api` granted to caspo's identity at the broker; `agent-common[documents]` and its brand for Word and PDF; and its `/mcp` intelligence tools withholding operator-provided claims from a person who is not an admin, as its HTTP routes do (the tools take the caller's `include_operator`, default true).
- **master:** `rules-library/platform/canonical-app-shape.md` still names `config/rooms.yaml` and "the stamped room page" among the sanctioned files, and lists "collection" among the nouns a page must not show; lodged on master-project#233 for a sitting.

## Open

- **Arming costs about a second before the first word** (§Measured): the CLI waits for every server it names. It runs beside retrieval; whether a persona names fewer servers, or the gateway answers faster, is caspo's to weigh on its own host.
- **The first word under 3 s.** Not met on atlas under the load measured; the CLI's own start-up is most of what remains. Whether to start a CLI ahead per worker (about 1 GB per persona) is the operator's to weigh once caspo times this release on its own host.
- **Renaming `@poodle64/librarian` to `@poodle64/chat`**, once a trusted publisher exists for the new name.
