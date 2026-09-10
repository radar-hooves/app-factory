# @poodle64/librarian

Milton's conversation surface, as a Svelte 5 package: the stream client, the
transcript state, and the chat components an app renders instead of
rebuilding: the transcript with its own follow-scroll, the composer with
attachments, citation chips and the source pane they open.

Owned by the library. This is Milton's surface; design-system is its press.
Change it here, consume it there.

## What is here

```text
src/lib/
  client.ts                ask(): streams Claude Code's OWN events, unaltered
  transcript.svelte.ts     Transcript state, the fold/segment/describe helpers
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
    composer/              the input box: attachments, scope chips, send/stop
    markdown/              sanitised, streaming-safe markdown + highlighting
    activity-group/        a whole investigation, as one quiet line
    tool-row/              one tool call
    thinking-row/          one thought, or one line of between-tool narration
    working/               the pre-first-token "something is happening" indicator
```

## Installation

```bash
pnpm add @poodle64/librarian @poodle64/ui @lucide/svelte
```

`svelte`, `@poodle64/ui`, `@lucide/svelte`, `marked`, `isomorphic-dompurify`
and `shiki` are peer dependencies: declare them yourself so Renovate tracks
their versions and `pnpm ls` shows them.

The components style themselves with Tailwind utility classes, same as
`@poodle64/ui`, so the same line is needed in the app's `app.css`:

```css
@source '../node_modules/@poodle64/librarian/dist'; /* Tailwind content scan */
```

Without it the classes ship in `dist` but Tailwind's default content scan
never sees `node_modules`, so nothing compiles for them — no build error, no
lint hit, just an unstyled transcript.

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
				scope="library"
				onscope={() => {}}
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
| The ask route            | `ask({ endpoint })`: a room's `/api/rooms/{id}/ask`, a caller's `/api/caller/ask`                                                                                                          |
| Attachments              | nothing: `ask()` posts multipart (`question`, `resume`, `collections[]`, `files[]`) whenever `files` is non-empty, and JSON when it is not. The route must accept both                      |
| Reading a cited document | `loadDocument(document_id) => Promise<{title, sections: [{anchor, heading, text}]}>`, proxied through the app's own authenticated route (cadmus: `GET /api/sources/documents/{id}/content`) |
| Asking again             | `onregenerate`: re-send the last question as a NEW turn; the package exposes the action and never re-asks by itself                                                                        |
| Asking a follow-up       | `onsuggest(question)`: ask it as a NEW turn. Without the handler the chips do not render at all — a chip that does nothing is worse than no chip                                            |
| The empty state          | `welcome` and up to three `examples`                                                                                                                                                        |
| What this surface covers | `scope`: one statement per room, in the host's own words. Rendered above the first turn and folded to a line once the conversation starts                                                   |
| The words themselves     | `copy`: a partial of `LibrarianCopy`. Every component resolves it itself, so overriding one line does not mean restating the rest                                                            |

Nothing here fetches on its own behalf. The library's document read is
authenticated, and a package that called it directly would be reaching past
the app's proxy with a session it has no business holding.

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
"Milton answered this one without a source. He may not hold a document that
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

Milton narrates between tool calls — "Let me also check whether…" — and the
caller stream gives that nowhere to arrive: it carries no `thinking` blocks
at all, so narration is an ordinary `text` block, identical to the answer
except in POSITION. `segment()` reads that position: a text block with any
tool call still to come in the turn is narration and folds into the activity
group as a thinking-shaped row; the run of text after the LAST tool call is
the answer. While a turn streams the judgement is provisional — a block that
is currently last renders as prose, and a tool call arriving after it
re-homes it — which is why `segment()` is pure and re-derived per event
rather than deciding once.

The cost is an answer Milton interrupts to go back to the shelf: its first
half folds away. Position is the only signal the stream gives, and a rule
read off the prose itself would be unexplainable the first time it misfired.

### Changing the words

Every user-visible string this package renders lives in
`@poodle64/librarian/copy`, and every component takes a partial of it:

```svelte
<Conversation {turns} {running} copy={{ notVerified: 'not checked yet' }} />
```

Overriding one line leaves the rest as the package wrote them, and a key
passed as `undefined` — the shape a host produces from state that has not
loaded — is ignored rather than rendering nothing where a word belongs.

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

`docs/screenshots/` is eleven states x three widths x both themes, taken by
`scripts/screenshots.mjs` against the console's `/librarian` lab route
running from its own static build. The same script asserts what a screenshot
cannot: that nothing scrolls sideways at any width, that the source pane
opens and closes from the keyboard with focus returning to the chip and is
really draggable, that the scope statement folds once there is a
conversation over it and reopens from that line, that a follow-up chip asks
its question and takes the rest of the row with it, and that Milton's
between-tool narration is nowhere in the answer prose before the activity
line is opened. It exits non-zero on any of them.

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
