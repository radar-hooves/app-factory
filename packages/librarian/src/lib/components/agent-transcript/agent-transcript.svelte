<!--
  One question and everything Milton did answering it.

  Three things carry the shape. The question is a bubble against the edge, so a
  reader scanning back finds their own words without reading any of the answer.
  The answer is plain prose held to a reading measure, because a full-width
  line at 1440 is the single clearest tell that a surface was never read on.
  Everything Milton DID is one quiet line above it, never a stack.
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
		trustMark,
		type Citation
	} from '../../citations';
	import { resolveCopy, type LibrarianCopy } from '../../copy';
	import Working from '../working/working.svelte';
	import ActivityGroup from '../activity-group/activity-group.svelte';
	import ArtefactCard from '../artefact-card/artefact-card.svelte';
	import Markdown from '../markdown/markdown.svelte';

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
		kind = 'answer',
		title,
		onopenartefact
	}: Props = $props();

	const isArtefact = $derived(kind === 'artefact');

	const words = $derived(resolveCopy(copy));

	const asked = $derived(readerQuestion(question));

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
	 * Two different failures reach a turn and only one of them carries a
	 * message. `library_error` (the stream never opened) sets `error`; a run
	 * that opened and then failed sets `is_error` on its terminal frame and
	 * says nothing at all — Claude Code's own `error_max_turns` and
	 * `error_during_execution` are exactly that shape. Reading only `error`
	 * left the second kind rendering as a clean, complete answer: no banner,
	 * a duration badge, and — worse — the "he holds nothing on this" line,
	 * which is a claim about the shelf made off a run that never finished
	 * looking.
	 */
	const failure = $derived(
		outcome?.error ?? (outcome?.isError ? words.answerFailed : null)
	);

	// A failed turn settles too, and "Ask again" is the one thing a reader wants
	// from it — there is just nothing to copy.
	const settled = $derived(!running && (hasAnswer || Boolean(failure)));

	/**
	 * Milton answered and cited nothing, and we WATCHED him do it.
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

<article class="flex flex-col gap-3">
	<!-- Right-aligned, following Claude and ChatGPT rather than a VS Code-style
	     panel: this surface is read by people who arrive with those two as
	     their model of what a chat looks like. -->
	<div
		class="bg-surface-3 text-foreground border-border max-w-[85%] self-end rounded-2xl border px-4 py-2.5 text-base break-words whitespace-pre-wrap"
	>
		{asked}
	</div>

	{#if running && segments.length === 0}
		<Working />
	{/if}

	{#each segments as seg (seg.index)}
		{#if seg.kind === 'activity'}
			<ActivityGroup group={seg} live={running && seg.index === lastIndex} />
		{:else if !isArtefact}
			<div class="max-w-[72ch] min-w-0">
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
			</div>
		{/if}
	{/each}

	{#if isArtefact && settled}
		<ArtefactCard title={title ?? 'Briefing'} citationCount={sources.length} onopen={() => onopenartefact?.()} />
	{/if}

	{#if !isArtefact && sources.length > 0}
		<section class="max-w-[72ch]">
			<h2 class="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
				{words.sources}
			</h2>
			<ol class="flex flex-col gap-1">
				{#each sources as source (source.n)}
					{@const mark = trustMark(source, words)}
					<li>
						<button
							type="button"
							onclick={() => oncite?.(source)}
							disabled={!source.document_id || !oncite}
							class="border-border hover:border-border-strong hover:bg-surface-2 focus-visible:ring-ring flex w-full items-baseline gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent"
						>
							<span
								class="bg-primary/15 text-foreground shrink-0 rounded px-1.5 font-mono text-xs tabular-nums"
								>{source.n}</span
							>
							<span class="min-w-0">
								<span class="text-foreground">{source.title}</span>
								{#if source.section}<span class="text-muted-foreground">
										· {source.section}</span
									>{/if}
								<!-- Same muted register as the section, deliberately. An
								     unverified source is not an error and must not be
								     dressed as one; the words carry the difference, and a
								     red one would have a colleague discount a document
								     that is simply new. -->
								{#if mark}<span class="text-muted-foreground/80"> · {mark}</span>{/if}
							</span>
						</button>
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	{#if !isArtefact && notHeld}
		<p class="text-muted-foreground max-w-[72ch] text-sm">{words.notHeld}</p>
	{/if}

	{#if !isArtefact && followUps.length > 0}
		<section class="max-w-[72ch]">
			<h2 class="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
				{words.suggestions}
			</h2>
			<!-- Wrapping, not scrolling: at 390 a question is most of a line, so a
			     row of three would clip two of them to fragments. -->
			<ul class="flex flex-wrap gap-2">
				{#each followUps as followUp (followUp)}
					<li class="max-w-full">
						<button
							type="button"
							onclick={() => {
								used = true;
								onsuggest?.(followUp);
							}}
							class="border-border hover:border-border-strong hover:bg-surface-2 focus-visible:ring-ring text-foreground max-w-full rounded-full border px-3.5 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
						>
							{followUp}
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if failure}
		<p
			class="border-status-error/40 bg-status-error/10 text-foreground max-w-[72ch] rounded-lg border px-3 py-2 text-sm"
			role="alert"
		>
			{failure}
		</p>
	{/if}

	{#if !isArtefact && settled}
		<div class="text-muted-foreground -ml-1.5 flex items-center gap-1">
			{#if hasAnswer}
				<button
					type="button"
					onclick={copyToClipboard}
					aria-label={copied ? words.copiedAnswer : words.copyAnswer}
					class="hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
				>
					{#if copied}<CheckIcon class="size-3.5" />{:else}<CopyIcon class="size-3.5" />{/if}
					<span>{copied ? words.copiedAnswer : words.copyAnswer}</span>
				</button>
			{/if}
			{#if onregenerate}
				<button
					type="button"
					onclick={onregenerate}
					aria-label={words.askAgain}
					class="hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
				>
					<RefreshCwIcon class="size-3.5" />
					<span>{words.askAgain}</span>
				</button>
			{/if}
			{#if outcome && !failure}
				<span class="pl-1 font-mono text-xs tabular-nums opacity-70">
					{((outcome.durationMs ?? 0) / 1000).toFixed(1)}s
				</span>
			{/if}
		</div>
	{/if}
</article>
