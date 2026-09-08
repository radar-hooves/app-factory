<!--
  A whole investigation, as one line the reader can open.

  Fifteen tool rows stood between the question and the first word of the
  answer, so the answer had to be scrolled to. While the agent is working the
  steps are worth watching, so they show live. The moment prose starts
  arriving they fold to a single summary — the same move Claude makes with
  "Researched for 49s".
-->
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { summariseActivity, type ActivityGroup } from '../../transcript.svelte';
	import ToolRow from '../tool-row/tool-row.svelte';
	import ThinkingRow from '../thinking-row/thinking-row.svelte';

	interface Props {
		group: ActivityGroup;
		/** True while this group is the live one — it stays open. */
		live: boolean;
	}

	let { group, live }: Props = $props();
	let expanded = $state(false);
	const open = $derived(live || expanded);
</script>

{#if live}
	<div class="flex flex-col gap-1.5">
		{#each group.steps as step (step.block.index)}
			{#if step.block.kind === 'tool'}
				<ToolRow block={step.block} repeats={step.repeats} running={true} />
			{:else}
				<ThinkingRow
					block={step.block}
					active={step.block.index === group.steps.at(-1)?.block.index}
				/>
			{/if}
		{/each}
	</div>
{:else}
	<div>
		<button
			type="button"
			class="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
		>
			<ChevronRightIcon class="size-3.5 transition-transform {expanded ? 'rotate-90' : ''}" />
			<span>{summariseActivity(group)}</span>
		</button>
		{#if open}
			<div class="border-border mt-2 ml-1.75 flex flex-col gap-1.5 border-l pl-3">
				{#each group.steps as step (step.block.index)}
					{#if step.block.kind === 'tool'}
						<ToolRow block={step.block} repeats={step.repeats} running={false} />
					{:else}
						<ThinkingRow block={step.block} active={false} />
					{/if}
				{/each}
			</div>
		{/if}
	</div>
{/if}
