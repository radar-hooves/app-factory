<!--
  One question and everything the agent did answering it.

  User turn as a rounded bubble, assistant prose led by a status dot, tool
  calls as rows in the flow, thinking as stacked phase labels that dim once
  superseded.
-->
<script lang="ts">
	import { segment, type Block, type Outcome } from '../../transcript.svelte';
	import Working from '../working/working.svelte';
	import ActivityGroup from '../activity-group/activity-group.svelte';
	import Markdown from '../markdown/markdown.svelte';

	interface Props {
		question: string;
		blocks: Block[];
		outcome: Outcome | null;
		running: boolean;
		/** Forwarded to Markdown; omit if the caller has no collections to chip. */
		collectionNames?: Set<string>;
	}

	let { question, blocks, outcome, running, collectionNames = new Set() }: Props = $props();

	// An activity group stays live — and therefore open — only while it is the
	// last thing in the turn. As soon as prose arrives after it, it folds.
	const segments = $derived(segment(blocks));
	const lastIndex = $derived(segments.at(-1)?.index ?? -1);
</script>

<article class="flex flex-col gap-3">
	<!-- Right-aligned, following Claude and ChatGPT rather than a VS Code-style
	     panel: this surface is read by people who arrive with those two as
	     their model of what a chat looks like. -->
	<div
		class="bg-surface-3 text-foreground border-border max-w-[85%] self-end rounded-2xl border px-4 py-2.5 text-base"
	>
		{question}
	</div>

	{#if running && segments.length === 0}
		<Working />
	{/if}

	{#each segments as seg (seg.index)}
		{#if seg.kind === 'activity'}
			<ActivityGroup group={seg} live={running && seg.index === lastIndex} />
		{:else}
			<div class="flex gap-2.5">
				<span class="bg-muted-foreground/40 mt-2.5 size-1.5 shrink-0 rounded-full"></span>
				<div class="min-w-0 flex-1">
					<Markdown
						content={seg.text}
						streaming={running && seg.index === lastIndex}
						{collectionNames}
					/>
				</div>
			</div>
		{/if}
	{/each}

	{#if outcome}
		<p class="text-muted-foreground pl-4 font-mono text-xs tabular-nums">
			{#if outcome.error}
				{outcome.error}
			{:else}
				{outcome.turns} turns · {((outcome.durationMs ?? 0) / 1000).toFixed(1)}s
			{/if}
		</p>
	{/if}
</article>
