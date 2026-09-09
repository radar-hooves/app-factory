# @poodle64/librarian

Milton's conversation surface, as a Svelte 5 package: the stream client, the
transcript state, and the chat components (transcript, composer, markdown,
tool/thinking rows, the working indicator). An app renders the librarian
instead of rebuilding it.

Owned by the library — this is Milton's surface; design-system is its press.
Change it here, consume it there.

## What is here

```text
src/lib/
  client.ts               ask(): streams Claude Code's OWN events, unaltered
  transcript.svelte.ts     Transcript state, the fold/segment/describe helpers
  history.svelte.ts        the browser-held conversation list, namespaced per caller
  components/
    agent-transcript/       one question and everything the agent did answering it
    composer/                the input box: value, scope chips, send/stop
    markdown/                sanitised, streaming-safe markdown + syntax highlighting
    activity-group/          a run of tool calls, collapsed to one line
    tool-row/                one tool call
    thinking-row/            one thinking block
    working/                 the pre-first-token "something is happening" indicator
```

Deliberately excluded: the library console's own `CorpusTree`, `DocumentPane`
and collection picker. Those are furniture for browsing a corpus, not part of
talking to Milton, and stay in the library's own frontend.

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

Every export is its own subpath, matching `@poodle64/ui`'s convention:

```svelte
<script lang="ts">
	import { ask } from '@poodle64/librarian/client';
	import { Transcript } from '@poodle64/librarian/transcript';
	import AgentTranscript from '@poodle64/librarian/agent-transcript';
	import Composer from '@poodle64/librarian/composer';

	let question = $state('');
	let running = $state(false);
	const transcript = new Transcript();
	let controller: AbortController | null = null;

	async function submit() {
		const asked = question.trim();
		if (!asked || running) return;

		question = '';
		running = true;
		transcript.reset();
		controller = new AbortController();

		try {
			for await (const event of ask({
				question: asked,
				endpoint: '/api/caller/ask',
				signal: controller.signal
			})) {
				transcript.apply(event);
				if (event.type === 'result' || event.type === 'library_error') running = false;
			}
		} finally {
			running = false;
			controller = null;
		}
	}

	function stop() {
		controller?.abort();
		running = false;
	}
</script>

<AgentTranscript {question} blocks={transcript.blocks} outcome={transcript.outcome} {running} />

<Composer
	bind:value={question}
	{running}
	scope="library"
	onscope={() => {}}
	onsubmit={submit}
	onstop={stop}
/>
```

`ask()`'s `endpoint` defaults to `/api/agent/ask`; pass whatever route the
consuming app mounts (a room's `/api/rooms/{id}/ask`, a caller's
`/api/caller/ask`) and an optional `fetch` for a caller-authenticated wrapper.

`createHistory(namespace)` from `@poodle64/librarian/history` gives each app,
or each room inside an app, its own `localStorage` key, so two consumers
never collide on one conversation list:

```ts
import { createHistory, titleFrom } from '@poodle64/librarian/history';

const history = createHistory('cadmus.rooms.defence-personnel');
history.load();
```

## Verifying a change

```bash
pnpm run build   # svelte-package + publint
pnpm run check   # svelte-check
pnpm run test    # build + vitest
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
