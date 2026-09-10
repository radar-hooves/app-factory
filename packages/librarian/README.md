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
  citations.ts             the Citation shape, `[n]` markers, "## Sources"
  attachments.ts           what a reader may attach, and the limits
  follow-scroll.svelte.ts  follow the stream until the reader disagrees
  history.svelte.ts        the browser-held conversation list, per caller
  components/
    conversation/          the whole reading surface: scroll, pill, pane, composer slot
    agent-transcript/      one question and everything Milton did answering it
    document-pane/         the cited document, open at the cited passage
    composer/              the input box: attachments, scope chips, send/stop
    markdown/              sanitised, streaming-safe markdown + highlighting
    activity-group/        a whole investigation, as one quiet line
    tool-row/              one tool call
    thinking-row/          one thinking block
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
| The empty state          | `welcome` and up to three `examples`                                                                                                                                                        |

Nothing here fetches on its own behalf. The library's document read is
authenticated, and a package that called it directly would be reaching past
the app's proxy with a session it has no business holding.

### Citations

The library emits one SSE frame after the final assistant text:

```json
{
	"type": "citations",
	"items": [
		{ "n": 1, "document_id": "…", "title": "…", "section": "…", "anchor": "…", "snippet": "…" }
	]
}
```

`Transcript.apply()` puts it on `transcript.citations`; inline `[n]` markers
in the prose become chips, and the chip opens `DocumentPane` at the cited
section. Until that frame ships everywhere, the same chips are DERIVED from
a trailing "## Sources" block in the answer: those render and read, and are
inert, because a title and a section are not an id.

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

`docs/screenshots/` is eight states x three widths x both themes, taken by
`scripts/screenshots.mjs` against the console's `/librarian` lab route
running from its own static build. The same script asserts what a screenshot
cannot: that nothing scrolls sideways at any width, and that the source pane
opens and closes from the keyboard with focus returning to the chip. It
exits non-zero on either.

```bash
pnpm --filter @poodle64/console run build
pnpm --filter @poodle64/librarian run screenshots
```

## Releasing

1. Change a component; bump `version` in `package.json` (CalVer).
2. `pnpm build`, which runs `svelte-package` then `publint`.
3. Commit, tag `librarian-v<version>`, push the tag.
4. `.github/workflows/publish.yaml` runs on that push and should publish via
   npm OIDC trusted publishing: check it with
   `gh run list --workflow=publish.yaml`. As of 2026.9.5 every run since
   `ui-v2026.9.2` fails at the `npm publish` step with
   `E404 Not Found - PUT .../@poodle64%2flibrarian` (an OIDC/trusted-publisher
   binding issue, since `Build and test package` passes first). Until that
   is diagnosed and fixed, publish manually from `packages/librarian/`:
   ```bash
   printf '//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\n' > .npmrc
   signet exec --identity huginn-claude --broker https://portcullis.example.com \
     --credential npm-publish-token --env-var NODE_AUTH_TOKEN -- npm publish
   rm -f .npmrc
   ```
   Confirm with `npm view @poodle64/librarian version`.
