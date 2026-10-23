<!--
  One question and everything the persona did answering it.

  Four things carry the shape, ChatGPT's and Claude's. The question is a quiet
  bubble against the trailing edge, so a reader scanning back finds their own
  words without reading any of the answer. The answer is prose under it, signed
  with the persona's name and the time, in no box: space and type tell one turn
  from the next (the operator's bar, 19/10/2026: "clean and elegant, like what
  you get when you chat with ChatGPT or Claude"). Everything the persona DID is
  one quiet line in the answer, never a stack. And the measure is the package's
  own CSS, never a utility class a consuming app's Tailwind has to discover in
  `dist` — the one that got away compiled to `max-width: none` in production
  and left a 2302px-wide transcript.
-->
<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import type { Snippet } from 'svelte';
	import {
		outcomeLine,
		readerQuestion,
		readFrom,
		segment,
		type Artefact,
		type Block,
		type DescribeTool,
		type Outcome,
		type TextBlock
	} from '../../transcript.svelte';
	import {
		citationMarkers,
		resolveCitations,
		splitSources,
		type Citation
	} from '../../citations';
	import { DEFAULT_PERSONA, fill, personaName, resolveCopy, type ChatCopy } from '../../copy';
	import { webKey, webSources } from '../../web-sources';
	import { newestPerName, writtenKey, type Written, type WrittenUrl } from '../../written';
	import { activityNow } from '../../steps';
	import type { Visual } from '../../visuals';
	import type { Verdict } from '../../chat.svelte';
	import AnswerMark from '../answer-mark/answer-mark.svelte';
	import AnswerShare from '../answer-share/answer-share.svelte';
	import Working from '../working/working.svelte';
	import ActivityGroup from '../activity-group/activity-group.svelte';
	import ArtefactCard from '../artefact-card/artefact-card.svelte';
	import Markdown from '../markdown/markdown.svelte';
	import SourceFold from '../source-fold/source-fold.svelte';
	import WrittenCard from '../written-card/written-card.svelte';

	/** Everything one turn renders from: what `Conversation` hands a host's
	 *  own `turn` snippet, so it can render this component or its own. */
	export interface AgentTranscriptProps {
		question: string;
		blocks: Block[];
		outcome: Outcome | null;
		running: boolean;
		/** Sources from the app's `citations` frame. Absent falls back to
		 *  whatever a "## Sources" block in the prose says. */
		citations?: Citation[];
		/** Forwarded to Markdown; omit if the caller has no collections to chip. */
		collectionNames?: Set<string>;
		/** Opens the document pane. Omit and chips render but do not open. */
		oncite?: (citation: Citation) => void;
		/** Offered on the LAST answer only — re-asks the same question. */
		onregenerate?: () => void;
		copy?: Partial<ChatCopy>;
		/** The persona's display name, signed on the answer card. */
		name?: string;
		/** When the question was asked, epoch ms. Rendered as a clock time —
		 *  which is a different fact from the duration badge beside the actions,
		 *  and a reader scanning back for "what did I ask after lunch" needs the
		 *  first one. Absent renders no time rather than a guess. */
		at?: number;
		/** What this turn produced for the reader to open, carded once it
		 *  settles: under the prose, or in its place when it IS the prose. */
		artefact?: Artefact;
		/** The artefact is open now. */
		artefactOpen?: boolean;
		/** Opens it. Omit and the card informs but does not open. */
		onopenartefact?: () => void;
		/** The persona's own words for its tools, and what they read. */
		describeTool?: DescribeTool;
		/** The names of the files that went with the question, shown as chips. */
		files?: string[];
		/** Replaces this question with `text` and asks it again from here
		 *  (`Chat.edit`), resolving false when that did not go through. Omit
		 *  and no edit control renders: not while an answer is being written. */
		onedit?: (text: string) => Promise<boolean>;
		/** The documents the persona wrote answering it, carded under the answer. */
		written?: Written[];
		/** The version the reading column shows now, by `writtenKey`. */
		showingWritten?: string;
		/** Opens a version in the reading column. Omit and the cards only link. */
		onopenwritten?: (written: Written) => void;
		/** Where a version downloads. Omit and no download links render. */
		writtenUrl?: WrittenUrl;
		/** Renderers by a fence's language: a block of one is drawn by its
		 *  component in the answer. Absent, every fence is code. */
		visuals?: Record<string, Visual>;
		/** When an answer this page did not start began, epoch ms: it is still
		 *  being written, and the clock counts from then. */
		answering?: number;
		/** Records a verdict on this answer. Omit and no mark renders: a
		 *  control that records nothing is worse than none. */
		onmark?: (verdict: Verdict) => Promise<boolean>;
		/** Where this answer's read-only view lives while it is shared, as the
		 *  host's own address. */
		shared?: string;
		/** Shares this answer (true) or stops sharing it (false), resolving
		 *  true once recorded. Omit and nothing about sharing renders: nothing
		 *  is shared unless the reader asks. */
		onshare?: (share: boolean) => Promise<boolean>;
		/** Prices `outcome.costUsd` in the host's own currency and words
		 *  ("about A$0.34"). The package never converts currency itself,
		 *  and a zero-cost run (a local model) shows no cost regardless. */
		formatCost?: (usd: number) => string;
		/** Drawn in place of the package's own "working" line while the answer has
		 *  shown nothing yet; given the line's `label` and `since`. */
		working?: Snippet<[{ label?: string; since?: number }]>;
		/** The app searches its collections for the question before the persona
		 *  starts, so the working line says so until the passages arrive. */
		retrieves?: boolean;
		/** Stops this answer, from the working line. Omit and it offers no Stop. */
		onstop?: () => void;
	}

	let {
		question,
		blocks,
		outcome,
		running,
		citations = [],
		collectionNames = new Set(),
		oncite,
		onregenerate,
		copy,
		name = DEFAULT_PERSONA,
		at,
		artefact,
		artefactOpen = false,
		onopenartefact,
		describeTool,
		files = [],
		onedit,
		written = [],
		showingWritten,
		onopenwritten,
		writtenUrl,
		visuals,
		answering,
		onmark,
		shared,
		onshare,
		formatCost,
		working,
		retrieves = false,
		onstop
	}: AgentTranscriptProps = $props();

	// The prose IS the artefact: it reads in the column, and the transcript
	// shows the card alone. A briefing the persona wrote as a document is that
	// document, and the prose is the line that says so.
	const isArtefact = $derived(artefact?.isAnswer === true && written.length === 0);

	const words = $derived(resolveCopy(copy, name));
	const who = $derived(personaName(name));

	const asked = $derived(readerQuestion(question));

	// The reader's own locale and their own clock. A date is added only once
	// the turn is not from today, because "14:32" is what a reader scanning
	// this morning's conversation is actually matching against.
	const clock = $derived.by(() => {
		if (at === undefined) return null;
		const when = new Date(at);
		const sameDay = new Date().toDateString() === when.toDateString();
		return {
			iso: when.toISOString(),
			text: when.toLocaleTimeString(undefined, {
				hour: 'numeric',
				minute: '2-digit',
				...(sameDay ? {} : { day: 'numeric', month: 'short' })
			})
		};
	});

	// An activity group is live (its last step the one under way) only while it
	// is the last thing in the turn; its rows stay open until the turn settles,
	// and then fold into its sentence.
	const segments = $derived(segment(blocks, describeTool));
	const lastIndex = $derived(segments.at(-1)?.index ?? -1);

	// An answer can arrive as SEVERAL text blocks with tool calls between them,
	// so the Sources block is at the end of the LAST one. It is split off that
	// block alone: splitting the joined answer and substituting the result back
	// into one segment would print every earlier block twice.
	//
	// And only once the answer has settled — mid-stream the "## Sources" heading
	// may be all that has arrived, with the list still to come.
	const texts = $derived(segments.filter((s): s is TextBlock => s.kind === 'text'));
	const lastTextIndex = $derived(texts.at(-1)?.index ?? -1);
	const split = $derived(
		running ? { body: '', citations: [] } : splitSources(texts.at(-1)?.text ?? '')
	);
	// What the calls read, when the answer names no source of its own.
	const read = $derived(running ? [] : readFrom(blocks, describeTool));
	const sources = $derived(
		resolveCitations(citations, split.citations.length > 0 ? split.citations : read)
	);

	/** The answer as a reader would paste it: every block, Sources stripped. */
	const answer = $derived(
		texts
			.map((s) => (s.index === lastTextIndex && split.citations.length > 0 ? split.body : s.text))
			.join('\n\n')
	);

	// Only a number the prose actually marks becomes a chip; a source list may
	// legitimately carry an entry the answer never points at inline.
	const numbers = $derived(
		new Set(citationMarkers(answer).filter((n) => sources.some((c) => c.n === n)))
	);

	const hasAnswer = $derived(texts.length > 0);

	// Pages the answer drew on, once it has settled: a link still being typed
	// is not a source. They are numbered on from the library's, and a link to
	// one reads as the same chip.
	const web = $derived.by(() => {
		if (running) return [];
		const from = Math.max(0, ...sources.map((c) => c.n));
		return webSources(blocks, answer).map((page, i) => ({ ...page, n: from + i + 1 }));
	});
	const webNumbers = $derived(new Map(web.map((page) => [webKey(page.url), page.n])));

	// Which day the pages were read: today only for a turn asked today.
	const readWhen = $derived.by(() => {
		if (at === undefined) return '';
		const when = new Date(at);
		if (new Date().toDateString() === when.toDateString()) return words.readToday;
		return fill(words.readOn, {
			date: when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
		});
	});

	const cards = $derived(newestPerName(written));

	// The working line's verb, while the turn runs.
	const doing = $derived(
		running
			? activityNow(blocks, written, words, {
					citations: citations.length,
					retrieves,
					resumed: answering !== undefined
				})
			: ''
	);

	const fileType = (file: string): string => {
		const ext = /\.([A-Za-z0-9]{1,5})$/.exec(file)?.[1];
		return ext ? ext.toUpperCase() : '';
	};

	let editing = $state(false);
	let edited = $state('');
	let sending = $state(false);

	function startEdit() {
		edited = asked;
		editing = true;
	}

	async function sendEdit() {
		const text = edited.trim();
		if (!text || !onedit || sending) return;
		sending = true;
		const sent = await onedit(text);
		sending = false;
		if (sent) editing = false;
	}

	/**
	 * What went wrong, if anything did — in words, whether or not the run gave
	 * any.
	 *
	 * Three shapes reach a turn and only one of them carries a message.
	 * `unreachable` is a stream that never opened or died half-way, which
	 * `client.ts` raises without words because that layer does not know whose
	 * voice to say them in. A run that opened and then failed sets `is_error`
	 * on its terminal frame and says nothing at all — Claude Code's own
	 * `error_max_turns` and `error_during_execution` are exactly that shape.
	 * Only a run that volunteered a message gets its own words through.
	 *
	 * Reading none of this left a failed turn rendering as a clean, complete
	 * answer: no banner, a duration badge, and — worse — the "answered without
	 * a source" line, which is a claim about the sources made off a run that
	 * never finished looking.
	 */
	const failure = $derived(
		outcome?.unreachable
			? words.unreachable
			: (outcome?.error ?? (outcome?.isError ? words.answerFailed : null))
	);

	// A turn nothing is answering any more that said nothing and ended with
	// nothing: stopped before a word came, often while it waited its turn.
	const unanswered = $derived(!running && !hasAnswer && outcome === null && !artefact);

	// A run that ended has settled, whatever it said: a failed one, where "Ask
	// again" is the one thing a reader wants, and one that handed in its answer
	// under a schema and said nothing at all, whose artefact is the answer. A
	// turn read back from history has no outcome and settles on its prose, and
	// an unanswered one settles on nothing, offering "Ask again".
	const settled = $derived(!running && (hasAnswer || outcome !== null || unanswered));

	/**
	 * The persona answered and cited nothing, and we WATCHED it happen.
	 *
	 * `outcome` is the gate, not merely an empty source list: a turn read back
	 * out of the conversation history is prose with no citations and no
	 * outcome, because history stores neither — and a stored answer that cited
	 * three documents would be labelled as holding nothing. Same for an answer
	 * a reader stopped: the frame naming its sources never arrived, so nothing
	 * here knows whether there were any.
	 */
	const notHeld = $derived(
		settled && hasAnswer && sources.length === 0 && Boolean(outcome) && !failure
	);

	let copied = $state(false);
	// Not `copy`: the prop of that name is the package's own words, and a
	// function shadowing it here would be a redeclaration, not a shadow.
	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(answer);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			// A denied clipboard permission is not worth an error state on an
			// answer the reader can still select by hand.
		}
	}
</script>

<article class="ds-lib-turn">
	<!-- Trailing-edge bubble, following Claude and ChatGPT rather than a
	     VS Code-style panel: this surface is read by people who arrive with
	     those two as their model of what a chat looks like. A session whose
	     stream never carried its prompt has no words to put here. -->
	{#if asked && editing}
		<form
			class="ds-lib-ask ds-lib-edit"
			onsubmit={(event) => {
				event.preventDefault();
				void sendEdit();
			}}
		>
			<textarea
				class="ds-lib-edit-text"
				rows="3"
				aria-label={words.editQuestion}
				bind:value={edited}
			></textarea>
			{#if files.length > 0}<p class="ds-lib-edit-note">{words.editFilesNote}</p>{/if}
			<div class="ds-lib-edit-actions">
				<button type="button" class="ds-lib-action" onclick={() => (editing = false)}>
					{words.cancel}
				</button>
				<button type="submit" class="ds-lib-action" disabled={!edited.trim() || sending}>
					{words.editSend}
				</button>
			</div>
		</form>
	{:else if asked}
		<div class="ds-lib-ask">
			{#if files.length > 0}
				<ul class="ds-lib-ask-files">
					{#each files as file, i (i)}
						<li class="ds-lib-ask-file">
							<span class="ds-lib-ask-file-icon" aria-hidden="true"><FileTextIcon size={16} /></span>
							<span class="ds-lib-ask-file-text">
								<span class="ds-lib-ask-file-name">{file}</span>
								{#if fileType(file)}<span class="ds-lib-ask-file-type">{fileType(file)}</span>{/if}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="ds-lib-bubble">{asked}</div>
			<div class="ds-lib-ask-meta">
				{#if onedit && !running}
					<button type="button" class="ds-lib-action" onclick={startEdit}>
						<PencilIcon size={14} />
						<span>{words.editQuestion}</span>
					</button>
				{/if}
				{#if clock}
					<time class="ds-lib-ask-time" datetime={clock.iso}>{clock.text}</time>
				{/if}
			</div>
		</div>
	{/if}

	<div class="ds-lib-answer">
		<header class="ds-lib-answer-head">
			<span class="ds-lib-avatar" aria-hidden="true">{who.slice(0, 1)}</span>
			<span class="ds-lib-who">{who}</span>
			{#if clock}
				<time class="ds-lib-answer-time" datetime={clock.iso}>{clock.text}</time>
			{/if}
		</header>

		{#each segments as seg (seg.index)}
			{#if seg.kind === 'activity'}
				<ActivityGroup
					group={seg}
					live={running && seg.index === lastIndex}
					{running}
					{written}
					copy={words}
				/>
			{:else if !isArtefact}
				<Markdown
					content={seg.index === lastTextIndex && split.citations.length > 0
						? split.body
						: seg.text}
					streaming={running && seg.index === lastIndex}
					{collectionNames}
					{visuals}
					copy={words}
					citationNumbers={numbers}
					{webNumbers}
					oncite={(n) => {
						const found = sources.find((c) => c.n === n);
						if (found) oncite?.(found);
					}}
				/>
			{/if}
		{/each}

		<!-- The one live line, under everything the turn has shown so far, as
		     Claude Code keeps its own at the foot of the work. -->
		{#if running}
			{#if working && segments.length === 0}
				{@render working({ label: doing, since: answering })}
			{:else}
				<Working copy={words} label={doing} since={answering} {onstop} />
			{/if}
		{/if}

		{#if artefact && settled && (isArtefact || !artefact.isAnswer)}
			<ArtefactCard {artefact} open={artefactOpen} onopen={onopenartefact} copy={words} />
		{/if}

		{#each cards as doc (writtenKey(doc))}
			<WrittenCard
				written={doc}
				open={showingWritten === writtenKey(doc)}
				onopen={onopenwritten ? () => onopenwritten(doc) : undefined}
				url={writtenUrl}
				copy={words}
			/>
		{/each}

		{#if !isArtefact && (sources.length > 0 || web.length > 0)}
			<SourceFold library={sources} {web} {words} {oncite} {readWhen} />
		{/if}

		<!-- An empty `notHeld` is a host whose persona answers from no sources,
		     where "without a source" would be a claim about nothing. -->
		{#if unanswered && asked}
			<p class="ds-lib-not-held">{words.noAnswer}</p>
		{/if}

		{#if !isArtefact && notHeld && words.notHeld}
			<p class="ds-lib-not-held">{words.notHeld}</p>
		{/if}

		{#if failure}
			<p class="ds-lib-failure" role="alert">{failure}</p>
		{/if}

		{#if !isArtefact && settled && (hasAnswer || onregenerate || (outcome && !failure))}
			<div class="ds-lib-actions">
				{#if hasAnswer}
					<button
						type="button"
						class="ds-lib-action"
						onclick={copyToClipboard}
						aria-label={copied ? words.copiedAnswer : words.copyAnswer}
					>
						{#if copied}<CheckIcon size={14} />{:else}<CopyIcon size={14} />{/if}
						<span>{copied ? words.copiedAnswer : words.copyAnswer}</span>
					</button>
				{/if}
				{#if onshare && hasAnswer && !failure}
					<AnswerShare {onshare} {shared} copy={words} />
				{/if}
				{#if onmark && hasAnswer && !failure}
					<AnswerMark {onmark} copy={words} />
				{/if}
				{#if onregenerate}
					<button
						type="button"
						class="ds-lib-action"
						onclick={onregenerate}
						aria-label={words.askAgain}
					>
						<RefreshCwIcon size={14} />
						<span>{words.askAgain}</span>
					</button>
				{/if}
				<!-- What it took, which is not the same fact as when it was
				     asked; both are on the card and neither stands in for the
				     other. Cost folds into the SAME line, never a
				     second one, once the host offers it. -->
				{#if outcome && !failure}
					<span class="ds-lib-duration">{outcomeLine(outcome, formatCost)}</span>
				{/if}
			</div>
		{/if}
	</div>
</article>

<style>
	.ds-lib-turn {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.ds-lib-ask {
		display: flex;
		width: 100%;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
		align-self: flex-end;
	}

	/* A raised tone, not the brand: both references set the reader's words on
	   a quiet surface at the trailing edge, and position and shape are what a
	   reader scanning back finds them by. It stays on the SHORT side of the
	   transcript on purpose — a question is a line or two, an answer is
	   paragraphs, so the bubble is an accent and boxing the answer would be a
	   wall. */
	.ds-lib-bubble {
		max-width: 85%;
		border: 1px solid transparent;
		border-radius: var(--ds-radius-xl);
		background: var(--ds-color-surface-2);
		padding: 0.625rem 1rem;
		color: var(--ds-color-foreground);
		font-size: 1rem;
		line-height: 1.5rem;
		overflow-wrap: break-word;
		white-space: pre-wrap;
	}

	.ds-lib-ask-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.ds-lib-ask-files {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.ds-lib-ask-file {
		display: flex;
		max-width: 100%;
		align-items: center;
		gap: 0.625rem;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-full);
		padding: 0.375rem 0.875rem 0.375rem 0.5rem;
	}

	.ds-lib-ask-file-icon {
		display: flex;
		flex: none;
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-ask-file-text {
		display: flex;
		min-width: 0;
		flex-direction: column;
		font-size: var(--ds-text-2xs);
		line-height: 1.25;
	}

	.ds-lib-ask-file-name {
		color: var(--ds-color-foreground);
		font-size: 0.8125rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.ds-lib-ask-file-type {
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-edit {
		align-items: stretch;
	}

	.ds-lib-edit-text {
		width: 100%;
		resize: vertical;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-lg);
		background: var(--ds-color-surface-1);
		padding: 0.5rem 0.75rem;
		color: var(--ds-color-foreground);
		font: inherit;
	}

	.ds-lib-edit-note {
		margin: 0;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.25rem;
	}

	.ds-lib-ask-time,
	.ds-lib-answer-time {
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
		font-variant-numeric: tabular-nums;
	}

	.ds-lib-answer {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.ds-lib-answer-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.ds-lib-avatar {
		display: flex;
		width: 1.375rem;
		height: 1.375rem;
		flex: none;
		align-items: center;
		justify-content: center;
		border-radius: var(--ds-radius-full);
		/* Opaque, never a translucent tint. An 18% wash of a dark primary over a
		   dark surface has almost no luminance separation, so the initial fell
		   under the 3:1 floor for a non-text graphic and read as a smudge —
		   measured 2.55:1 on a dark-mode host. A solid fill carries the hue AND
		   the contrast. */
		background: var(--ds-color-primary-solid, var(--ds-color-primary));
		color: var(--ds-color-primary-solid-foreground, var(--ds-color-primary-foreground));
		font-size: var(--ds-text-2xs);
		font-weight: 600;
		text-transform: uppercase;
	}

	.ds-lib-who {
		flex: 1;
		color: var(--ds-color-foreground);
		font-size: 0.8125rem;
		font-weight: 600;
	}

	.ds-lib-not-held {
		margin: 0;
		color: var(--ds-color-muted-foreground);
		font-size: 0.875rem;
	}

	.ds-lib-failure {
		margin: 0;
		border: 1px solid color-mix(in oklab, var(--ds-color-status-error) 40%, transparent);
		border-radius: var(--ds-radius-lg);
		background: color-mix(in oklab, var(--ds-color-status-error) 10%, transparent);
		padding: 0.5rem 0.75rem;
		color: var(--ds-color-foreground);
		font-size: 0.875rem;
	}

	.ds-lib-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem;
		margin-inline-start: -0.375rem;
		color: var(--ds-color-muted-foreground);
	}

	/* 44px tall: each is a thumb's target on a phone. */
	.ds-lib-action {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.375rem;
		border: 0;
		border-radius: var(--ds-radius-md);
		background: none;
		padding: 0.25rem 0.375rem;
		color: inherit;
		font: inherit;
		font-size: var(--ds-text-2xs);
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease;
	}

	.ds-lib-action:hover {
		background: var(--ds-color-surface-2);
		color: var(--ds-color-foreground);
	}

	.ds-lib-action:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-duration {
		padding-inline-start: 0.25rem;
		font-family: var(--ds-font-code);
		font-size: var(--ds-text-2xs);
		font-variant-numeric: tabular-nums;
		opacity: 0.7;
	}
</style>
