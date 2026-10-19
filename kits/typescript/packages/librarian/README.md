# @poodle64/librarian

An agent's conversation surface, as a Svelte 5 package: the stream client, the
transcript state, and the chat components an app renders instead of
rebuilding: the transcript with its own follow-scroll, the composer with
attachments, citation chips and the source pane they open.

The persona is an argument. Name it once — `name="penny"` — and every word the
package says is composed from it. The default name is a neutral
"Assistant"; no string in this package names one app's persona.

The npm name `@poodle64/librarian` is the package's identity and stays; what a
person sees never says it.

## What is here

```text
src/lib/
  client.ts                ask() and watch(): Claude Code's OWN events, unaltered
  transcript.svelte.ts     Transcript state, the fold/segment/describe helpers
  session.svelte.ts        Session: a whole stream of runs, as turns
  chat.svelte.ts           Chat: the page's controller, over a persona's chat routes or a job's
  citations.ts             the Citation shape, `[n]` markers, the trust mark
  copy.ts                  every word this package says, and the host's overrides
  attachments.ts           what a reader may attach, and the limits
  follow-scroll.svelte.ts  follow the stream until the reader disagrees
  components/
    conversation/          the whole reading surface: scroll, pill, pane, composer slot
    conversation-list/     past conversations, newest first: reopen, rename, download, delete
    answer-mark/           helpful or not, with a note, on the last answer
    answer-share/          share an answer read-only, and stop sharing it
    fair-use-notice/       today's allowance, beside the composer
    scope-statement/       what a persona answers from, and what it does not hold
    agent-transcript/      one question and everything the persona did answering it
    document-pane/         the cited document, open at the cited passage
    artefact-card/         an artefact's card, in the host's words
    artefact-pane/         an artefact that is its answer's prose, in the column
    composer/              the input box: attachments, one collection control, a note, send/stop
    markdown/              sanitised, streaming-safe markdown + highlighting
    activity-group/        a whole investigation, as one quiet line
    tool-row/              one tool call
    thinking-row/          one thought, or one line of between-tool narration
    working/               the pre-first-token "something is happening" indicator
```

## Installation

```bash
pnpm add @poodle64/librarian @lucide/svelte
```

`svelte`, `@lucide/svelte`, `marked`, `isomorphic-dompurify` and `shiki` are
peer dependencies: declare them yourself so Renovate tracks their versions and
`pnpm ls` shows them.

**No Tailwind content-scan line, and deliberately none.** These components
carry their own CSS, written against the `--ds-*` tokens and compiled by
whatever bundler the app already runs, so the transcript looks the same in
every consumer whether or not that consumer scans `node_modules`. It did not
always: the package styled itself with Tailwind utilities and asked each app
for an `@source` line, Pebblestone's `app.css` never had one, and the console
shipped a 2302px-wide transcript with no cards, no measure and unstyled
tables — no build error, no lint hit, nothing failing. A package whose
appearance depends on a line in its consumer's stylesheet does not have a
look; it has a hope.

What it does need is the token layer every app already imports:

```css
@import '@poodle64/design-tokens/tokens.css';
```

One knob: `--ds-lib-measure` (default `46rem`) sets the transcript's reading
column. Set it on any ancestor.

## Consuming the package

Every export is its own subpath, matching `@poodle64/ui`'s convention.
`Conversation` owns the scroll container and the source pane, so the host
gives it a height and a composer and nothing else:

```svelte
<script lang="ts">
	import { ask } from '@poodle64/librarian/client';
	import { Transcript, type Turn } from '@poodle64/librarian/transcript';
	import Conversation from '@poodle64/librarian/conversation';
	import Composer from '@poodle64/librarian/composer';

	let question = $state('');
	let files = $state<File[]>([]);
	let running = $state(false);
	let turns = $state<Turn[]>([]);
	let asked = $state('');
	const transcript = new Transcript();
	let controller: AbortController | null = null;

	async function submit() {
		asked = question.trim();
		if (!asked || running) return;
		await run(asked, files);
	}

	async function run(text: string, attached: File[]) {
		question = '';
		files = [];
		running = true;
		transcript.reset();
		turns = [...turns, { id: crypto.randomUUID(), question: text, blocks: [], outcome: null }];
		controller = new AbortController();

		try {
			for await (const event of ask({
				question: text,
				files: attached,
				endpoint: '/api/agent/outrider/ask',
				signal: controller.signal
			})) {
				transcript.apply(event);
				const live = turns.at(-1);
				if (live) {
					live.blocks = transcript.blocks;
					live.outcome = transcript.outcome;
					live.citations = transcript.citations;
				}
			}
		} finally {
			running = false;
			controller = null;
		}
	}

	async function loadDocument(id: string) {
		const response = await fetch(`/api/sources/documents/${id}/content?page=all`);
		const doc = await response.json();
		return { title: doc.document_title, sections: sectionsFrom(doc) };
	}
</script>

<div class="flex h-dvh flex-col">
	<Conversation
		{turns}
		{running}
		version={transcript.version}
		name="Outrider"
		welcome="Ask Outrider about pay, allowances, leave and conditions of service."
		examples={['How much recreation leave do I get?']}
		onexample={(q) => (question = q)}
		onregenerate={() => run(asked, [])}
		scope="Outrider answers from the ADF Pay and Conditions Manual (PACMAN). It does not hold your own pay records or anything about your individual case."
		{loadDocument}
	>
		{#snippet composer()}
			<Composer
				bind:value={question}
				bind:files
				{running}
				onsubmit={submit}
				onstop={() => controller?.abort()}
			/>
		{/snippet}
	</Conversation>
</div>
```

`version` is what keeps the scroll following: streaming grows an EXISTING
block's text in place, so a count of turns never changes and an effect keyed
on it fires once and never again.

### What the host must wire

| Concern                  | How                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The ask route            | `ask({ endpoint, collection? })`: the persona's `/api/agent/{persona}/ask`, `endpoint` required. `collection` narrows the question to one collection by name; absent asks across every collection the person may read |
| Attachments              | nothing: `ask()` posts multipart (`question`, `resume`, `collection`, `files[]`) whenever `files` is non-empty, and JSON when it is not. The route must accept both                      |
| Reading a cited document | `loadDocument(document_id) => Promise<{title, sections: [{anchor, heading, text}]}>`, proxied through the app's own authenticated route (caspo: `GET /api/sources/documents/{id}/content`) |
| Asking again             | `onregenerate`: re-send the last question as a NEW turn; the package exposes the action and never re-asks by itself                                                                         |
| Choosing a collection    | `Composer`'s `collections` (`{ name, title?, description? }[]`, the ones the person may read) and `collection` (the chosen name; undefined is all of them), with `oncollection(name \| undefined)`. From two collections up it is ONE control naming the choice, opening a listbox (searchable from eight) where each shows by its title (the name made readable where there is none) over its description, never a retrieval summary |
| The empty state          | `welcome` and up to three `examples`. With a composer, the opening and the composer sit together in the middle of the panel, the examples, the folded scope and `lead` under it; the first turn docks the composer at the foot |
| Conversation controls    | `toolbar`: a snippet at the measure's trailing edge above the transcript, outside its scroll (the room page's Past questions and New question)                                               |
| What this surface covers | `scope`: one statement per persona, in the host's own words. Rendered above the first turn and folded to a line once the conversation starts                                                   |
| The words themselves     | `copy`: a partial of `ChatCopy`. Every component resolves it itself, so overriding one line does not mean restating the rest                                                           |
| An answer its own way    | `turn`: a snippet given each turn's `AgentTranscriptProps` in place of `AgentTranscript`. Render your own from the parts, or `AgentTranscript` inside your own to add to it               |
| What leads a conversation | `lead`: a snippet inside the scroll, under the opening and the scope, so a tall one scrolls with the conversation instead of taking its height; under the centred composer before the first question |

Nothing here fetches on its own behalf. The document read is
authenticated, and a package that called it directly would be reaching past
the app's proxy with a session it has no business holding.

### A persona's page, whole: `Chat`

The hand-wired page above is the parts. A stamped chat page is `Chat` over
the persona's routes, and the components bound to it:

```svelte
<script lang="ts">
	import { Chat } from '@poodle64/librarian/chat';
	import Conversation from '@poodle64/librarian/conversation';
	import ConversationList from '@poodle64/librarian/conversation-list';
	import Composer from '@poodle64/librarian/composer';
	import FairUseNotice from '@poodle64/librarian/fair-use-notice';

	const chat = new Chat(chatTransport(persona, collection)); // the app's own client, below
	const wanted = $derived(page.url.searchParams.get('c'));

	// The address names the conversation; `open` and `new` are safe here.
	$effect(() => {
		if (wanted && wanted !== chat.conversationId) void chat.open(wanted);
		else if (!wanted) chat.new();
	});
</script>

<ConversationList
	conversations={chat.conversations}
	failed={chat.listFailed}
	current={chat.conversationId}
	href={(id) => `?c=${id}`}
	onnew={() => chat.new()}
	onrename={(id, title) => chat.rename(id, title)}
	ondownload={(id) => chat.download(id)}
	ondelete={(id) => chat.remove(id)}
/>
<Conversation
	turns={chat.turns}
	running={chat.busy}
	version={chat.version}
	answering={chat.answering}
	onregenerate={() => chat.again()}
	onmark={(turn, verdict) => chat.mark(turn, verdict)}
>
	{#snippet composer()}
		<FairUseNotice quota={chat.quota} />
		<Composer
			bind:value={chat.draft}
			bind:files={chat.files}
			running={chat.busy}
			{collections}
			{collection}
			oncollection={(next) => (collection = next)}
			sendWhileRunning={chat.sendWhileRunning}
			onsubmit={() => chat.ask()}
			onstop={() => chat.stop()}
		/>
	{/snippet}
</Conversation>
```

`chat.list()` reads the list once; after that it follows every answer.

A turn the host asks as a `kind` (`chat.ask(question, 'briefing')`, from
`Composer`'s `onbriefing`) goes to the route as `client.ask()`'s `kind`, comes
back on `StoredTurn.kind`, and carries whatever `new Chat(transport, {
artefact })` says that kind opens, on a live turn and a reopened one alike:
`{ title: 'Briefing', isAnswer: true }` cards it and opens its prose in the
column. `again()` asks it as the same kind.

### Asking one collection, and what it cost

`chat.ask(question?, kind?, collection?)` carries the collection to
`client.ask()`'s `collection`, `StoredTurn.collection` reads it back, and
`again()` asks the same one: the same shape as `kind`, alongside it. The host
holds the chosen name and the list the person may read (the app's
`listCollections`); `Composer` shows the choice and the host passes it on.

Under a settled answer, `AgentTranscript`'s footer shows the duration, and
`formatCost(usd) => string` folds what the host can price into the same line
in its own currency and words (`56.3s · about A$0.34`). Without `formatCost`,
or where `costUsd` is `0` (a local model), it is the duration alone, never a
raw USD figure and never which model answered.

Past `turnLimit` turns (`Composer`'s prop, 8 by default), a quiet banner
appears above the box, "This conversation is getting long. A new question
keeps Outrider quick." with a "New question" button, because a follow-up
re-reads the whole conversation, so each one costs more than the last.
`turnCount` and `onnewquestion` are both required for it to render; either
missing and the composer stays as it is today.

The transport is the app's own client over its routes, and the shapes are
the routes' own bodies (`ConversationSummary`, `ConversationRead`,
`StoredTurn`, `Quota`), so the stamped slice returns them as they are and
the transport passes them through:

| `ChatTransport` | Route                                                 |
| --------------- | ----------------------------------------------------- |
| `ask`           | `POST {persona}/ask`, through `client.ask()`          |
| `read`          | `GET conversations/{id}`                              |
| `stop`          | `POST conversations/{id}/stop`                        |
| `quota`         | `GET quota`                                           |
| `list`          | this person's conversations with the persona          |
| `rename`        | `PATCH conversations/{id}`                            |
| `remove`        | `DELETE conversations/{id}`                           |
| `download`      | `GET conversations/{id}/export`, as `{ name, body }`  |
| `mark`          | its answer mark, where the agent takes one (optional) |
| `share`         | share an answer read-only, or stop (optional)         |

What the controller relies on the routes to say:

| The route says                                                             | The page                                                                                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `system/init` with `session_id`                                            | `conversationId`, which the host puts in the address                                                       |
| 429 on the ask                                                             | drops the turn, puts the words and files back in the box, reads the allowance                              |
| 409 on the ask: the conversation is already being answered                 | drops the turn, keeps the words, shows it still answering                                                  |
| `answering_since` on a read                                                | `answering`: the question in flight with "still answering" and its clock, read again every 5 s till it clears |
| a stream that dropped (`agent_error` with `dropped`) on a named conversation | reads it rather than failing the turn: a locked phone loses the connection, not the answer              |

A turn belongs to the server. Leaving a conversation, or the page, leaves
its answer being written; `stop()` asks the server to end it, and before the
agent has named a new conversation it holds the stream open, unseen, until
it does. `again()` asks the last question as a new turn: the conversation is
append-only because the agent's transcript is.

A job is `new Chat(jobTransport)`, where `JobTransport` is its `watch`,
`message` and `stop` (godswood's run view). The turns are `Session`'s; a
message goes onto the run while it works and opens its stream again once it
has settled; `carriesOn()` keeps a closed stream watched while the host says
the job may go on by itself; `sendWhileRunning` is true.

| Concern                  | How                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| The answer mark          | `onmark(turn, verdict)` on `Conversation`: resolve true once recorded. Offered on the last settled answer only; without it no mark renders       |
| Sharing an answer        | `onshare(turn, share)` on `Conversation`, over `chat.share`: every settled answer offers Share, which copies the link `StoredTurn.shared` names; a shared one offers Copy link and Stop sharing. Nothing is shared unless the reader asks. A host's own `turn` places `AnswerShare` (`./answer-share`) with the `onshare` and `shared` it is handed |
| A shared answer, read    | `Conversation` given `[storedTurn(id, 0, answer)]` from `./chat` and no handlers, no composer: the question, the answer and its sources, read-only, citations opening as in the chat |
| Still answering          | `answering` on `Conversation`, from the controller                                                                                               |
| Reopening                | `reopening` on `Conversation` while a reopened conversation has no turns yet (`chat.conversationId` set, `chat.turns` empty): docked and silent, never a new conversation's centred opening |
| The allowance            | `FairUseNotice quota={…}` in the composer snippet: a count while there are questions left, a notice with `support_url` once there are none. Nothing for `exempt`, or a `limit` of 0 |
| Past conversations       | `ConversationList`: newest first, `href` makes each row a link, and each act renders only when its handler is given; a delete asks first. A host laying it over the page (a sheet) passes `onclose` for the header's close |

### Watching a session somebody else started

A session the APP started — a persona reading a document with nobody asking —
is watched rather than asked. `watch()` GETs its stream; `Session` folds it
into turns: the prompt and every later message on the reader's side (the CLI
echoes each one back under `--replay-user-messages`), each run's answer on the
persona's, each settled by its own `result`. A stream without deltas is folded
from its whole messages. A run under `--json-schema` hands in its answer by
calling the CLI's `StructuredOutput` tool: that call is no step of the work,
the words before it stay the answer, and what it handed in is the run's
`outcome.structuredOutput`, the natural source of the host's `artefact`. Events are deduped by `uuid`, so opening the watch
again after sending a message folds only what is new.

```svelte
<script lang="ts">
	import { watch } from '@poodle64/librarian/client';
	import { Session } from '@poodle64/librarian/session';

	const session = new Session();
	let watching = $state(false);

	async function follow(signal: AbortSignal) {
		watching = true;
		try {
			for await (const event of watch({ endpoint: `/api/agent/${persona}/jobs/${id}/watch`, signal }))
				session.apply(event);
		} finally {
			watching = false;
		}
	}

	// The host's own additions: what a run handed in, carded under its answer.
	const turns = $derived(
		session.turns.map((turn) =>
			turn.outcome?.structuredOutput ? { ...turn, artefact: artefactFrom(turn) } : turn
		)
	);
</script>

<Conversation
	{turns}
	running={watching && session.working}
	version={session.version}
	{name}
	{describeTool}
	copy={{ sources: 'Read from', notHeld: '' }}
	onopenartefact={(turn) => (showing = turn.id)}
	{showing}
	oncite={(citation) => showPage(citation.document_id)}
>
	{#snippet composer()}
		<Composer
			bind:value
			{running}
			{name}
			sendWhileRunning
			note="It carries on from where it stopped."
			{onsubmit}
			{onstop}
		/>
	{/snippet}
</Conversation>
```

`watch()` differs from `ask()` in one way: a clean close with no `result` is
not a failure, because a stopped run and a session waiting between runs both
end that way.

| Concern                | How                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The persona's tools    | `describeTool(block) => ToolWords \| undefined`: the row (`verb`, `object`, `detail`), the activity line's counts (`tally`), and what it read (`source`). `undefined` leaves a call to the package's own words |
| What an answer read    | `ToolWords.source` lists under the answer, under `copy.sources`; tapping one calls `oncite`. Nothing checked it, so it carries no trust mark                          |
| An artefact            | `turn.artefact = { title, summary }` cards under the prose once the turn settles; `isAnswer: true` is an artefact that IS the prose, and replaces it                  |
| Opening it             | `onopenartefact(turn)` and `showing` (the turn id the host shows). Without a handler, an `isAnswer` artefact opens in `ArtefactPane` and any other offers no action |
| "Answered without a source" | `copy.notHeld: ''` for a persona that answers from no sources                                                                                                     |
| Saying something mid-run | `Composer`'s `sendWhileRunning`: while the session works the box stays open and Send sits beside Stop. For a route that reads a message while the run works; a chat leaves it off and waits for its answer |

### Citations

The app emits one SSE frame before the persona's answer, from the passages
it retrieved for the question:

```json
{
	"type": "citations",
	"items": [
		{
			"n": 1,
			"document_id": "…",
			"title": "…",
			"section": "…",
			"anchor": "…",
			"snippet": "…",
			"verified_at": "2026-06-23"
		}
	]
}
```

`Transcript.apply()` puts it on `transcript.citations`; inline `[n]` markers
in the prose become chips, and the chip opens `DocumentPane` at the cited
section. Without that frame, the same chips are DERIVED from a trailing
"## Sources" block in the answer: those render and read, and are inert,
because a title and a section are not an id.

### The trust mark

`verified_at` is the date the last recheck found the document unchanged at
its publisher, `YYYY-MM-DD`, resolved by the app from its own catalogue —
never from what the model wrote, because a trust mark a model can author is
not a trust mark. Null means nothing has ever confirmed it.

Both the source list and the pane render it in words: **verified 23 Jun 2026**
or **not verified**, in the same muted register as the section beside it. An
unverified source is not an error and is not dressed as one — the words carry
the difference, and a red one would have a colleague discount a document that
is simply new.

A DERIVED citation carries no mark at all. It has no catalogued document
behind it, so "not verified" would be a claim about a record nothing here
ever read.

An answer that settles having cited nothing says so, once, under the prose:
"Outrider answered this one without a source. There may be no document here that
covers it." Only on a turn whose stream this surface actually watched finish
— a turn read back out of a conversation whose record holds no citations shows
none, and labelling it as holding nothing would be a lie about an
answer that may have cited three documents.

### Where the answer starts

The persona narrates between tool calls — "Let me also check whether…" — and the
caller stream gives that nowhere to arrive: it carries no `thinking` blocks
at all, so narration is an ordinary `text` block, identical to the answer
except in POSITION. `segment()` reads that position: a text block with any
tool call still to come in the turn is narration and folds into the activity
group as a thinking-shaped row; the run of text after the LAST tool call is
the answer. While a turn streams the judgement is provisional — a block that
is currently last renders as prose, and a tool call arriving after it
re-homes it — which is why `segment()` is pure and re-derived per event
rather than deciding once.

The cost is an answer the persona interrupts to go back to its tools: its first
half folds away. Position is the only signal the stream gives, and a rule
read off the prose itself would be unexplainable the first time it misfired.

### Who is speaking, and in what words

Every user-visible string lives in `@poodle64/librarian/copy`, and every one
of them is composed from the persona's name:

```svelte
<Conversation {turns} {running} name="penny" />
<Composer bind:value {running} name="penny" {collections} {collection} {oncollection} {onsubmit} {onstop} />
```

That one prop carries the working line ("Penny is looking…"), both composer
placeholders, the uncited-answer note, both failure sentences, the scope
label, the collection picker's label, the opening line, the name signed on every answer and the
accessible name of the scroll region. A slug is fine: `penny` renders as
"Penny", `chief-engineer` as "Chief Engineer", and a name the host already
capitalised is left exactly as written.

A host that wants different words still overrides one at a time:

```svelte
<Conversation {turns} {running} name="penny" copy={{ notVerified: 'not checked yet' }} />
```

Overriding one line leaves the rest as the package wrote them, and a key
passed as `undefined` — the shape a host produces from state that has not
loaded — is ignored rather than rendering nothing where a word belongs.

### When the stream fails

`ask()` never throws. A refused route, a `fetch` the browser blocks on CORS
after an expired session redirects it, a 200 that turns out to be a login
page, a connection that dies mid-answer and a stream that simply stops
without a terminal frame all arrive as one `agent_error` event and a
finished iteration. That matters because the host's `for await` loop is what
re-enables its Send button: a thrown generator left Pebblestone's console
disabled, silent and waiting indefinitely every time a session expired.

The event carries no words — this layer does not know whose voice to say them
in — so the turn renders `copy.unreachable` in the persona's own name and
settles, offering "Ask again".

### Timestamps

`Turn.at` (epoch ms) renders as a clock time on the question and the answer,
which is a different fact from the duration badge beside the actions. A
host that persists conversations sets it; a host that does not gets one
stamped when the turn first appears, and a turn already on screen at mount —
one read back out of a stored conversation — deliberately shows none rather than claiming
it was asked this afternoon.

### The system preamble

A host may prepend its own instruction to every question
(`{preamble}\n\n{question}`). `readerQuestion()` strips leading
paragraphs addressed to the model before the question renders, so a
colleague never sees it. Pass the question as it went on the wire; the
transcript shows what they asked.

## Verifying a change

```bash
pnpm run build        # svelte-package + publint
pnpm run check        # svelte-check
pnpm run test         # build + vitest
pnpm run screenshots  # the state grid, real engine (see below)
```

`docs/screenshots/` is twenty-three states x three widths x both themes, taken by
`scripts/screenshots.mjs` against the console's `/chat` lab route
running from its own static build. The same script asserts what a screenshot
cannot: that nothing scrolls sideways at any width, that the source pane
opens and closes from the keyboard with focus returning to the chip and is
really draggable, that the scope statement folds once there is a
conversation over it and reopens from that line, that the collection control
starts on all of them, stays one control for 27 and takes a searched pick from
the keyboard, that past questions come over the page and hand focus back, that the persona's
between-tool narration is nowhere in the answer prose before the activity
line is opened, that a job's artefact and the pages it read open in the
host's own columns and never in a pane of the package's, and that the reading
column holds its 46rem measure and stays centred at every width. Its `live`
scene is `Chat` itself over a fake of the chat routes, driven: a question
streams, counts against the allowance and takes a mark;
one asked again is stopped; a conversation reopened mid-answer says so and
settles; one is renamed and the open one deleted. It exits non-zero on any of
them. The job states fold a stream captured from the real CLI
(`src/test/fixtures/`).

The console's `app.css` deliberately does NOT scan this package's `dist`, so
the grid is taken in a consumer that compiles none of its Tailwind classes —
which is the only way the measure claim above means anything.

```bash
pnpm --filter @poodle64/console run build
pnpm --filter @poodle64/librarian run screenshots
```

Where Playwright's own Chromium will not start (NixOS), name one that does:
`CHROMIUM=/nix/store/…-playwright-browsers/chromium-…/chrome-linux/chrome`.

## Releasing

1. Change a component; bump `version` in `package.json` (CalVer).
2. `pnpm build`, which runs `svelte-package` then `publint`.
3. Merge to main. No tag.
4. `.github/workflows/publish-kit-typescript.yaml` (repo root) runs on that push and publishes the new
   version through npm's trusted publisher. Watch it: `gh run list -R radar-hooves/app-factory --workflow=publish-kit-typescript.yaml`,
   then `npm view @poodle64/librarian version`.
