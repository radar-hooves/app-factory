<!--
  What the persona did before it answered: one row per step while the turn
  runs, folded behind one line once it settles.

  While it runs, each step is its own row as it starts, in order, the way
  Claude Code's own panel lists them: what the step is doing in a reader's
  words, turning to what it did and what it found when its result comes, and
  each opens on what went in and what came back. The working line under the
  turn says what is happening now. Once the turn settles the rows fold behind
  one sentence composed from them ("Read your attachment, searched the library
  and the web, and wrote a minute · 6 steps"), so a settled answer is one quiet
  line of what was done (operator, 19/10/2026) and the rows are a tap away.

  The persona's between-tool commentary is a step in here as well. It reaches
  the caller as an ordinary `text` block, not a `thinking` one, so `segment()`
  re-homes any text with a tool call still to come into this group; it renders
  as a ThinkingRow beside the tools, open while the turn runs.
-->
<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	// Aliased: a component and a type of one name make svelte-package emit a
	// declaration whose default export is the type, which no consumer can render.
	import type { ActivityGroup as Group } from '../../transcript.svelte';
	import { resolveCopy, type ChatCopy } from '../../copy';
	import { stepsSummary } from '../../steps';
	import type { Written } from '../../written';
	import ToolRow from '../tool-row/tool-row.svelte';
	import ThinkingRow from '../thinking-row/thinking-row.svelte';

	interface Props {
		group: Group;
		/** True while this group is the live one: its last step is the one under way. */
		live: boolean;
		/** True while the turn has not settled: the rows stay open. Absent, `live`. */
		running?: boolean;
		/** The documents the turn wrote: a step that wrote one says its kind. */
		written?: Written[];
		copy?: Partial<ChatCopy>;
	}

	let { group, live, running, written = [], copy }: Props = $props();
	let open = $state(false);

	const words = $derived(resolveCopy(copy));
	const unsettled = $derived(running ?? live);
	const summary = $derived(stepsSummary(group.steps, written, words));
</script>

<div class="ds-lib-steps">
	{#if !unsettled}
		<button
			type="button"
			class="ds-lib-steps-head"
			onclick={() => (open = !open)}
			aria-expanded={open}
		>
			<span class="ds-lib-steps-line">
				{summary.sentence}<span class="ds-lib-steps-trail">{` · ${summary.trail}`}</span>
			</span>
			<span class="ds-lib-steps-chevron" aria-hidden="true">
				{#if open}<ChevronUpIcon size={15} />{:else}<ChevronDownIcon size={15} />{/if}
			</span>
		</button>
	{/if}

	{#if unsettled || open}
		<div class="ds-lib-steps-rows" class:is-live={unsettled}>
			{#each group.steps as step, i (step.block.index)}
				{#if step.block.kind === 'tool'}
					<ToolRow block={step.block} words={step.words} running={live} {copy} />
				{:else}
					<ThinkingRow
						block={step.block}
						active={live && i === group.steps.length - 1}
						reading={unsettled}
						{copy}
					/>
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

	/* Live, the rows are the turn's own lines, not a list opened from a fold. */
	.ds-lib-steps-rows.is-live {
		margin-top: 0;
		border-inline-start: 0;
		padding-inline-start: 0;
	}
</style>
