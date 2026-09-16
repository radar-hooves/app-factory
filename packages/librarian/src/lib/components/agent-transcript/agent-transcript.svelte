<!--
  One question and everything the persona did answering it.

  Four things carry the shape. The question is a bubble against the trailing
  edge, so a reader scanning back finds their own words without reading any of
  the answer. The answer is a bounded card under it, signed with the persona's
  name and the time, because a transcript of unbounded prose reads as a log
  and the director's first words about the live screen were "it doesn't look
  like a ChatGPT window". Everything the persona DID is one quiet line inside
  that card, never a stack. And the measure is the package's own CSS, never a
  utility class a consuming app's Tailwind has to discover in `dist` — the one
  that got away compiled to `max-width: none` in production and left a
  2302px-wide transcript.
-->
<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import {
		readerQuestion,
		segment,
		type Block,
		type Outcome,
		type TextBlock
	} from '../../transcript.svelte';
	import {
		citationMarkers,
		resolveCitations,
		splitSources,
		type Citation
	} from '../../citations';
	import { DEFAULT_PERSONA, personaName, resolveCopy, type LibrarianCopy } from '../../copy';
	import Working from '../working/working.svelte';
	import ActivityGroup from '../activity-group/activity-group.svelte';
	import ArtefactCard from '../artefact-card/artefact-card.svelte';
	import Markdown from '../markdown/markdown.svelte';
	import SourceList from '../source-list/source-list.svelte';

	interface Props {
		question: string;
		blocks: Block[];
		outcome: Outcome | null;
		running: boolean;
		/** Sources from the library's `citations` frame. Absent falls back to
		 *  whatever a "## Sources" block in the prose says. */
		citations?: Citation[];
		/** Forwarded to Markdown; omit if the caller has no collections to chip. */
		collectionNames?: Set<string>;
		/** Follow-ups from the library's `suggestions` frame. */
		suggestions?: string[];
		/** Opens the document pane. Omit and chips render but do not open. */
		oncite?: (citation: Citation) => void;
		/** Offered on the LAST answer only — re-asks the same question. */
		onregenerate?: () => void;
		/** Asks a follow-up. Offered on the LAST answer only; omit and the
		 *  chips do not render, because a chip that does nothing is worse than
		 *  no chip. */
		onsuggest?: (question: string) => void;
		copy?: Partial<LibrarianCopy>;
		/** The persona's display name, signed on the answer card. */
		name?: string;
		/** When the question was asked, epoch ms. Rendered as a clock time —
		 *  which is a different fact from the duration badge beside the actions,
		 *  and a reader scanning back for "what did I ask after lunch" needs the
		 *  first one. Absent renders no time rather than a guess. */
		at?: number;
		/** A study artefact rather than an ordinary answer: once settled, this
		 *  renders as a card instead of prose. */
		kind?: 'answer' | 'artefact';
		/** The artefact's own name, for the card. */
		title?: string;
		/** Opens the artefact in the reading column. Required wherever `kind`
		 *  is `'artefact'`. */
		onopenartefact?: () => void;
	}

	let {
		question,
		blocks,
		outcome,
		running,
		citations = [],
		collectionNames = new Set(),
		suggestions = [],
		oncite,
		onregenerate,
		onsuggest,
		copy,
		name = DEFAULT_PERSONA,
		at,
		kind = 'answer',
		title,
		onopenartefact
	}: Props = $props();

	const isArtefact = $derived(kind === 'artefact');

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

	// An activity group stays live — and therefore labelled "Working…" — only
	// while it is the last thing in the turn. As soon as prose arrives, it
	// settles into its count.
	const segments = $derived(segment(blocks));
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
	const sources = $derived(resolveCitations(citations, split.citations));

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
	 * a source" line, which is a claim about the shelf made off a run that
	 * never finished looking.
	 */
	const failure = $derived(
		outcome?.unreachable
			? words.unreachable
			: (outcome?.error ?? (outcome?.isError ? words.answerFailed : null))
	);

	// A failed turn settles too, and "Ask again" is the one thing a reader wants
	// from it — there is just nothing to copy.
	const settled = $derived(!running && (hasAnswer || Boolean(failure)));

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

	// A follow-up is offered once. Clicking it asks the question, which puts a
	// new turn below this one — and leaving the row up for the moment before
	// that arrives invites a second click on a third suggestion, asking two
	// questions the reader only meant to ask one of.
	let used = $state(false);
	const followUps = $derived(!used && onsuggest ? suggestions : []);

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
	     those two as their model of what a chat looks like. -->
	<div class="ds-lib-ask">
		<div class="ds-lib-bubble">{asked}</div>
		{#if clock}
			<time class="ds-lib-ask-time" datetime={clock.iso}>{clock.text}</time>
		{/if}
	</div>

	<div class="ds-lib-answer">
		<header class="ds-lib-answer-head">
			<span class="ds-lib-avatar" aria-hidden="true">{who.slice(0, 1)}</span>
			<span class="ds-lib-who">{who}</span>
			{#if clock}
				<time class="ds-lib-answer-time" datetime={clock.iso}>{clock.text}</time>
			{/if}
		</header>

		{#if running && segments.length === 0}
			<Working copy={words} />
		{/if}

		{#each segments as seg (seg.index)}
			{#if seg.kind === 'activity'}
				<ActivityGroup group={seg} live={running && seg.index === lastIndex} />
			{:else if !isArtefact}
				<Markdown
					content={seg.index === lastTextIndex && split.citations.length > 0
						? split.body
						: seg.text}
					streaming={running && seg.index === lastIndex}
					{collectionNames}
					citationNumbers={numbers}
					oncite={(n) => {
						const found = sources.find((c) => c.n === n);
						if (found) oncite?.(found);
					}}
				/>
			{/if}
		{/each}

		{#if isArtefact && settled}
			<ArtefactCard
				title={title ?? 'Briefing'}
				citationCount={sources.length}
				onopen={() => onopenartefact?.()}
			/>
		{/if}

		{#if !isArtefact && sources.length > 0}
			<SourceList {sources} {words} {oncite} />
		{/if}

		{#if !isArtefact && notHeld}
			<p class="ds-lib-not-held">{words.notHeld}</p>
		{/if}

		{#if !isArtefact && followUps.length > 0}
			<section>
				<h2 class="ds-lib-follow-heading">{words.suggestions}</h2>
				<!-- Wrapping, not scrolling: at 390 a question is most of a line, so
				     a row of three would clip two of them to fragments. -->
				<ul class="ds-lib-chips">
					{#each followUps as followUp (followUp)}
						<li>
							<button
								type="button"
								class="ds-lib-chip"
								onclick={() => {
									used = true;
									onsuggest?.(followUp);
								}}
							>
								{followUp}
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if failure}
			<p class="ds-lib-failure" role="alert">{failure}</p>
		{/if}

		{#if !isArtefact && settled}
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
				<!-- How long it took, which is not the same fact as when it was
				     asked; both are on the card and neither stands in for the
				     other. -->
				{#if outcome && !failure}
					<span class="ds-lib-duration">{((outcome.durationMs ?? 0) / 1000).toFixed(1)}s</span>
				{/if}
			</div>
		{/if}
	</div>
</article>

<style>
	.ds-lib-turn {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.ds-lib-ask {
		display: flex;
		max-width: 100%;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
		align-self: flex-end;
	}

	.ds-lib-bubble {
		max-width: 85%;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-xl);
		background: var(--ds-color-surface-3);
		padding: 0.625rem 1rem;
		color: var(--ds-color-foreground);
		font-size: 1rem;
		line-height: 1.5rem;
		overflow-wrap: break-word;
		white-space: pre-wrap;
	}

	.ds-lib-ask-time,
	.ds-lib-answer-time {
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
		font-variant-numeric: tabular-nums;
	}

	/* The card. A turn a reader can see the edges of is the whole of what the
	   director was asking for: one question and its answer, bounded, rather
	   than prose running edge to edge under the last lot of prose. */
	.ds-lib-answer {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-xl);
		background: var(--ds-color-surface-2);
		padding: 0.875rem 1rem 0.75rem;
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
		background: color-mix(in oklab, var(--ds-color-primary) 18%, transparent);
		color: var(--ds-color-foreground);
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

	.ds-lib-follow-heading {
		margin: 0 0 0.375rem;
		color: var(--ds-color-muted-foreground);
		font-family: inherit;
		font-size: var(--ds-text-2xs);
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.ds-lib-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.ds-lib-chips li {
		max-width: 100%;
	}

	.ds-lib-chip {
		max-width: 100%;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-full);
		background: none;
		padding: 0.5rem 0.875rem;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: 0.875rem;
		text-align: start;
		cursor: pointer;
		transition:
			background-color 150ms ease,
			border-color 150ms ease;
	}

	.ds-lib-chip:hover {
		border-color: var(--ds-color-border-strong);
		background: var(--ds-color-surface-1);
	}

	.ds-lib-chip:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
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
		align-items: center;
		gap: 0.25rem;
		margin-inline-start: -0.375rem;
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-action {
		display: flex;
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
		background: var(--ds-color-surface-1);
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
