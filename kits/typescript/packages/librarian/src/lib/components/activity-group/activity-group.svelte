<!--
  A whole investigation, as ONE line the reader can open.

  Not a stack. Fifteen tool rows between the question and the first word of the
  answer is the machine room on show, and a running commentary of "Let me
  check…" is worse: it narrates a mechanism the persona is under instruction
  never to mention. So there is exactly one row in every state — "Working…"
  while it runs, a count of what was done once it settles — and the steps are
  behind a disclosure for the reader who wants them.

  That commentary is a step in here too. It reaches the caller as an ordinary
  `text` block, not a `thinking` one, so `segment()` re-homes any text with a
  tool call still to come into this group; it renders as a ThinkingRow beside
  the tools, folded like the rest.
-->
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { summariseActivity, type ActivityGroup } from '../../transcript.svelte';
	import ToolRow from '../tool-row/tool-row.svelte';
	import ThinkingRow from '../thinking-row/thinking-row.svelte';

	interface Props {
		group: ActivityGroup;
		/** True while this group is the live one. */
		live: boolean;
	}

	let { group, live }: Props = $props();
	let expanded = $state(false);

	// A live group has nothing to count yet, so counting it reads as "0
	// searches" flickering up to the real number.
	const label = $derived(live ? 'Working…' : summariseActivity(group));
</script>

<div>
	<button
		type="button"
		class="ds-lib-activity-toggle"
		onclick={() => (expanded = !expanded)}
		aria-expanded={expanded}
	>
		<span class="ds-lib-activity-chevron" class:is-open={expanded}>
			<ChevronRightIcon size={14} />
		</span>
		{#if live}
			<span class="ds-lib-activity-dot"></span>
		{/if}
		<span>{label}</span>
	</button>
	{#if expanded}
		<div class="ds-lib-activity-steps">
			{#each group.steps as step (step.block.index)}
				{#if step.block.kind === 'tool'}
					<ToolRow
						block={step.block}
						repeats={step.repeats}
						words={step.words}
						running={live}
					/>
				{:else}
					<ThinkingRow block={step.block} active={false} />
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.ds-lib-activity-toggle {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		border: 0;
		background: none;
		padding: 0;
		color: var(--ds-color-muted-foreground);
		font: inherit;
		font-size: 0.875rem;
		line-height: 1.25rem;
		cursor: pointer;
		transition: color 150ms ease;
	}

	.ds-lib-activity-toggle:hover {
		color: var(--ds-color-foreground);
	}

	.ds-lib-activity-chevron {
		display: flex;
		flex: none;
		transition: transform 150ms ease;
	}

	.ds-lib-activity-chevron.is-open {
		transform: rotate(90deg);
	}

	.ds-lib-activity-dot {
		width: 0.375rem;
		height: 0.375rem;
		flex: none;
		border-radius: var(--ds-radius-full);
		background: var(--ds-color-status-info);
		animation: ds-lib-activity-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	.ds-lib-activity-steps {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-top: 0.5rem;
		margin-inline-start: 0.4375rem;
		border-inline-start: 1px solid var(--ds-color-border);
		padding-inline-start: 0.75rem;
	}

	@keyframes ds-lib-activity-pulse {
		50% {
			opacity: 0.4;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ds-lib-activity-dot {
			animation: none;
		}

		.ds-lib-activity-chevron {
			transition: none;
		}
	}
</style>
