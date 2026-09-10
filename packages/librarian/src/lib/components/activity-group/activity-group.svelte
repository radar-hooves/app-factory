<!--
  A whole investigation, as ONE line the reader can open.

  Not a stack. Fifteen tool rows between the question and the first word of the
  answer is the machine room on show, and a running commentary of "Let me
  check…" is worse: it narrates a mechanism Milton is under instruction never
  to mention. So there is exactly one row in every state — "Working…" while it
  runs, a count of what was done once it settles — and the steps are behind a
  disclosure for the reader who wants them.

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
		class="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
		onclick={() => (expanded = !expanded)}
		aria-expanded={expanded}
	>
		<ChevronRightIcon class="size-3.5 transition-transform {expanded ? 'rotate-90' : ''}" />
		{#if live}
			<span class="bg-status-info size-1.5 shrink-0 animate-pulse rounded-full"></span>
		{/if}
		<span>{label}</span>
	</button>
	{#if expanded}
		<div class="border-border mt-2 ml-1.75 flex flex-col gap-1.5 border-l pl-3">
			{#each group.steps as step (step.block.index)}
				{#if step.block.kind === 'tool'}
					<ToolRow block={step.block} repeats={step.repeats} running={live} />
				{:else}
					<ThinkingRow block={step.block} active={false} />
				{/if}
			{/each}
		</div>
	{/if}
</div>
