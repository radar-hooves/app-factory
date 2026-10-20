<!--
  What the persona did before it answered, folded behind one line.

  The line is a sentence composed from the steps ("Read your attachment,
  searched the library and the web, and wrote a minute · 6 steps"), and while
  the turn runs it says what is happening now. It opens on one row per step,
  in order, the way Claude Code's own panel lists them: each says what the step
  did in a reader's words and opens on what went in and what came back.

  The persona's between-tool commentary is a step in here as well. It reaches
  the caller as an ordinary `text` block, not a `thinking` one, so `segment()`
  re-homes any text with a tool call still to come into this group; it renders
  as a ThinkingRow beside the tools, folded like the rest.
-->
<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import type { ActivityGroup } from '../../transcript.svelte';
	import { resolveCopy, type ChatCopy } from '../../copy';
	import { stepsNow, stepsSummary } from '../../steps';
	import type { Written } from '../../written';
	import ToolRow from '../tool-row/tool-row.svelte';
	import ThinkingRow from '../thinking-row/thinking-row.svelte';

	interface Props {
		group: ActivityGroup;
		/** True while this group is the live one. */
		live: boolean;
		/** The documents the turn wrote: a step that wrote one says its kind. */
		written?: Written[];
		copy?: Partial<ChatCopy>;
	}

	let { group, live, written = [], copy }: Props = $props();
	let open = $state(false);

	const words = $derived(resolveCopy(copy));
	const summary = $derived(stepsSummary(group.steps, written, words));
	const now = $derived(stepsNow(group.steps, written, words));
</script>

<div class="ds-lib-steps">
	<button
		type="button"
		class="ds-lib-steps-head"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		<span class="ds-lib-steps-line">
			{#if live}
				<span class="ds-lib-steps-now">{now}</span>
			{:else}
				{summary.sentence}<span class="ds-lib-steps-trail">{` · ${summary.trail}`}</span>
			{/if}
		</span>
		<span class="ds-lib-steps-chevron" aria-hidden="true">
			{#if open}<ChevronUpIcon size={15} />{:else}<ChevronDownIcon size={15} />{/if}
		</span>
	</button>

	{#if open}
		<div class="ds-lib-steps-rows">
			{#each group.steps as step, i (step.block.index)}
				{#if step.block.kind === 'tool'}
					<ToolRow block={step.block} words={step.words} running={live} {copy} />
				{:else}
					<ThinkingRow block={step.block} active={live && i === group.steps.length - 1} {copy} />
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.ds-lib-steps-head {
		display: flex;
		width: 100%;
		align-items: flex-start;
		gap: 0.5rem;
		border: 0;
		background: none;
		padding: 0.25rem 0;
		color: var(--ds-color-muted-foreground);
		font: inherit;
		font-size: 0.875rem;
		line-height: 1.375rem;
		text-align: start;
		cursor: pointer;
	}

	.ds-lib-steps-head:hover {
		color: var(--ds-color-foreground);
	}

	.ds-lib-steps-head:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-steps-line {
		flex: 1;
	}

	.ds-lib-steps-now {
		color: var(--ds-color-foreground);
		font-weight: 500;
	}

	.ds-lib-steps-trail {
		font-size: var(--ds-text-2xs);
		opacity: 0.8;
	}

	.ds-lib-steps-chevron {
		display: flex;
		flex: none;
		padding-top: 0.25rem;
	}

	.ds-lib-steps-rows {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		margin-top: 0.25rem;
		border-inline-start: 1px solid var(--ds-color-border);
		padding-inline-start: 0.75rem;
	}
</style>
