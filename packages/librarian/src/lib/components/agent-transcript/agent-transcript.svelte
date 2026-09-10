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
		type Citation
	} from '../../citations';
	import Working from '../working/working.svelte';
	import ActivityGroup from '../activity-group/activity-group.svelte';
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
		/** Opens the document pane. Omit and chips render but do not open. */
		oncite?: (citation: Citation) => void;
		/** Offered on the LAST answer only — re-asks the same question. */
		onregenerate?: () => void;
	}

	let {
		question,
		blocks,
		outcome,
		running,
		citations = [],
		collectionNames = new Set(),
		oncite,
		onregenerate
	}: Props = $props();

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
	// A failed turn settles too, and "Ask again" is the one thing a reader wants
	// from it — there is just nothing to copy.
	const settled = $derived(!running && (hasAnswer || Boolean(outcome?.error)));

	let copied = $state(false);
	async function copy() {
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
		{:else}
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

	{#if sources.length > 0}
		<section class="max-w-[72ch]">
			<h2 class="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
				Sources
			</h2>
			<ol class="flex flex-col gap-1">
				{#each sources as source (source.n)}
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
							</span>
						</button>
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	{#if outcome?.error}
		<p
			class="border-status-error/40 bg-status-error/10 text-foreground max-w-[72ch] rounded-lg border px-3 py-2 text-sm"
			role="alert"
		>
			{outcome.error}
		</p>
	{/if}

	{#if settled}
		<div class="text-muted-foreground -ml-1.5 flex items-center gap-1">
			{#if hasAnswer}
				<button
					type="button"
					onclick={copy}
					aria-label={copied ? 'Copied' : 'Copy answer'}
					class="hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
				>
					{#if copied}<CheckIcon class="size-3.5" />{:else}<CopyIcon class="size-3.5" />{/if}
					<span>{copied ? 'Copied' : 'Copy'}</span>
				</button>
			{/if}
			{#if onregenerate}
				<button
					type="button"
					onclick={onregenerate}
					aria-label="Ask again"
					class="hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
				>
					<RefreshCwIcon class="size-3.5" />
					<span>Ask again</span>
				</button>
			{/if}
			{#if outcome && !outcome.error}
				<span class="pl-1 font-mono text-xs tabular-nums opacity-70">
					{((outcome.durationMs ?? 0) / 1000).toFixed(1)}s
				</span>
			{/if}
		</div>
	{/if}
</article>
