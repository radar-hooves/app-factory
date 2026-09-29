# @poodle64/librarian

An agent's conversation surface, as a Svelte 5 package: the stream client, the
transcript state, and the chat components an app renders instead of
rebuilding: the transcript with its own follow-scroll, the composer with
attachments, citation chips and the source pane they open.

The persona is an argument. Name it once — `name="penny"` — and every word the
package says is composed from it. Milton is the library's own persona and the
default; no string in this package names him.

Owned by the library. Design-system is its press: change it here, consume it
there.

## What is here

```text
src/lib/
  client.ts                ask() and watch(): Claude Code's OWN events, unaltered
  transcript.svelte.ts     Transcript state, the fold/segment/describe helpers
  session.svelte.ts        Session: a whole stream of runs, as turns
  citations.ts             the Citation shape, `[n]` markers, the trust mark
  copy.ts                  every word this package says, and the host's overrides
  attachments.ts           what a reader may attach, and the limits
  follow-scroll.svelte.ts  follow the stream until the reader disagrees
  history.svelte.ts        the browser-held conversation list, per caller
  components/
    conversation/          the whole reading surface: scroll, pill, pane, composer slot
    scope-statement/       what this room answers from, and what it does not hold
    agent-transcript/      one question and everything Milton did answering it
    document-pane/         the cited document, open at the cited passage
    artefact-card/         an artefact's card, in the host's words
    artefact-pane/         an artefact that is its answer's prose, in the column
    composer/              the input box: attachments, scope chips, a note, send/stop
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
				endpoint: '/api/caller/ask',
				signal: controller.signal
			})) {
				transcript.apply(event);
				const live = turns.at(-1);
				if (live) {
					live.blocks = transcript.blocks;
					live.outcome = transcript.outcome;
					live.citations = transcript.citations;
					live.suggestions = transcript.suggestions;
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
		welcome="Ask Milton about pay, allowances, leave and conditions of service."
		examples={['How much recreation leave do I get?']}
		onexample={(q) => (question = q)}
		onregenerate={() => run(asked, [])}
		onsuggest={(q) => run(q, [])}
		scope="Milton answers from the ADF Pay and Conditions Manual (PACMAN). He does not hold your own pay records or anything about your individual case."
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
| The ask route            | `ask({ endpoint })`: a room's `/api/rooms/{id}/ask`, a caller's `/api/caller/ask`                                                                                                           |
| Attachments              | nothing: `ask()` posts multipart (`question`, `resume`, `collections[]`, `files[]`) whenever `files` is non-empty, and JSON when it is not. The route must accept both                      |
| Reading a cited document | `loadDocument(document_id) => Promise<{title, sections: [{anchor, heading, text}]}>`, proxied through the app's own authenticated route (cadmus: `GET /api/sources/documents/{id}/content`) |
| Asking again             | `onregenerate`: re-send the last question as a NEW turn; the package exposes the action and never re-asks by itself                                                                         |
| Asking a follow-up       | `onsuggest(question)`: ask it as a NEW turn. Without the handler the chips do not render at all — a chip that does nothing is worse than no chip                                            |
| The empty state          | `welcome` and up to three `examples`                                                                                                                                                        |
| What this surface covers | `scope`: one statement per room, in the host's own words. Rendered above the first turn and folded to a line once the conversation starts                                                   |
| The words themselves     | `copy`: a partial of `LibrarianCopy`. Every component resolves it itself, so overriding one line does not mean restating the rest                                                           |

Nothing here fetches on its own behalf. The library's document read is
authenticated, and a package that called it directly would be reaching past
the app's proxy with a session it has no business holding.

### Watching a session somebody else started

A session the APP started — a persona reading a document with nobody asking —
is watched rather than asked. `watch()` GETs its stream; `Session` folds it
into turns: the prompt and every later message on the reader's side (the CLI
echoes each one back under `--replay-user-messages`), each run's answer on the
persona's, each settled by its own `result`. A stream without deltas is folded
from its whole messages. Events are deduped by `uuid`, so opening the watch
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
| "Answered without a source" | `copy.notHeld: ''` for a persona that answers from no shelf                                                                                                     |
| Saying something mid-run | `Composer`'s `sendWhileRunning`: while the session works the box stays open and Send sits beside Stop. For a route that reads a message while the run works; a chat leaves it off and waits for its answer |

### Citations

The library emits one SSE frame after the final assistant text:

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
section. Until that frame ships everywhere, the same chips are DERIVED from
a trailing "## Sources" block in the answer: those render and read, and are
inert, because a title and a section are not an id.

### The trust mark

`verified_at` is the date the last recheck found the document unchanged at
its publisher, `YYYY-MM-DD`, resolved by the library from its own catalogue —
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
"Milton answered this one without a source. There may be no document here that
covers it." Only on a turn whose stream this surface actually watched finish
— a turn read back out of `createHistory()` has no citations because history
stores none, and labelling it as holding nothing would be a lie about an
answer that may have cited three documents.

### Follow-ups

One more frame follows the citations, and only when the librarian named any:

```json
{ "type": "suggestions", "items": ["Can I carry leave over when I post?"] }
```

At most three, each short enough to fit a chip. `Transcript.suggestions`
carries them; `Conversation` offers them under the LAST answer, and clicking
one asks it through `onsuggest` and takes the whole row with it — the moment
between the click and the new turn arriving is otherwise long enough to ask a
second question by mistake.

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

The cost is an answer the persona interrupts to go back to the shelf: its first
half folds away. Position is the only signal the stream gives, and a rule
read off the prose itself would be unexplainable the first time it misfired.

### Who is speaking, and in what words

Every user-visible string lives in `@poodle64/librarian/copy`, and every one
of them is composed from the persona's name:

```svelte
<Conversation {turns} {running} name="penny" />
<Composer bind:value {running} name="penny" {scope} {onscope} {onsubmit} {onstop} />
```

That one prop carries the working line ("Penny is looking…"), both composer
placeholders, the uncited-answer note, both failure sentences, the scope
label, the opening line, the name signed on every answer card and the
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
without a terminal frame all arrive as one `library_error` event and a
finished iteration. That matters because the host's `for await` loop is what
re-enables its Send button: a thrown generator left Pebblestone's console
disabled, silent and waiting indefinitely every time a session expired.

The event carries no words — this layer does not know whose voice to say them
in — so the turn renders `copy.unreachable` in the persona's own name and
settles, offering "Ask again".

### Timestamps

`Turn.at` (epoch ms) renders as a clock time on the question and the answer
card, which is a different fact from the duration badge beside the actions. A
host that persists conversations sets it; a host that does not gets one
stamped when the turn first appears, and a turn already on screen at mount —
one read back out of history — deliberately shows none rather than claiming
it was asked this afternoon.

### The system preamble

A host prepends its own instruction to every question (cadmus sends
`{room.preamble}\n\n{question}`). `readerQuestion()` strips leading
paragraphs addressed to the model before the question renders, so a
colleague never sees it. Pass the question as it went on the wire; the
transcript shows what they asked.

`createHistory(namespace)` from `@poodle64/librarian/history` gives each app,
or each room inside an app, its own `localStorage` key:

```ts
import { createHistory, titleFrom } from '@poodle64/librarian/history';

const history = createHistory('cadmus.rooms.defence-personnel');
history.load();
```

## Verifying a change

```bash
pnpm run build        # svelte-package + publint
pnpm run check        # svelte-check
pnpm run test         # build + vitest
pnpm run screenshots  # the state grid, real engine (see below)
```

`docs/screenshots/` is sixteen states x three widths x both themes, taken by
`scripts/screenshots.mjs` against the console's `/librarian` lab route
running from its own static build. The same script asserts what a screenshot
cannot: that nothing scrolls sideways at any width, that the source pane
opens and closes from the keyboard with focus returning to the chip and is
really draggable, that the scope statement folds once there is a
conversation over it and reopens from that line, that a follow-up chip asks
its question and takes the rest of the row with it, that the persona's
between-tool narration is nowhere in the answer prose before the activity
line is opened, that a job's artefact and the pages it read open in the
host's own columns and never in a pane of the package's, and that the reading
column holds its 46rem measure and stays centred at every width. It exits
non-zero on any of them. The job states fold a stream captured from the real
CLI (`src/test/fixtures/`).

The console's `app.css` deliberately does NOT scan this package's `dist`, so
the grid is taken in a consumer that compiles none of its Tailwind classes —
which is the only way the measure claim above means anything.

```bash
pnpm --filter @poodle64/console run build
pnpm --filter @poodle64/librarian run screenshots
```

## Releasing

1. Change a component; bump `version` in `package.json` (CalVer).
2. `pnpm build`, which runs `svelte-package` then `publint`.
3. Commit, tag `librarian-v<version>`, push the tag.
4. `.github/workflows/publish.yaml` runs on that push and publishes through
   npm's trusted publisher. Watch it: `gh run list --workflow=publish.yaml`,
   then `npm view @poodle64/librarian version`.
