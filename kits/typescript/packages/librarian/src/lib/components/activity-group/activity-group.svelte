<!--
  What the persona did before it answered, one collapsed row per step, in
  order — the way Claude Code's own panel lists them.

  Each row says what the step did in a reader's words and opens on what went
  in and what came back. A thinking block is a folded row too: "Thinking…"
  while it streams, "Thought" once done.

  The persona's between-tool commentary is a step in here as well. It reaches
  the caller as an ordinary `text` block, not a `thinking` one, so `segment()`
  re-homes any text with a tool call still to come into this group; it renders
  as a ThinkingRow beside the tools, folded like the rest.
-->
<script lang="ts">
	import type { ActivityGroup } from '../../transcript.svelte';
	import type { ChatCopy } from '../../copy';
	import ToolRow from '../tool-row/tool-row.svelte';
	import ThinkingRow from '../thinking-row/thinking-row.svelte';

	interface Props {
		group: ActivityGroup;
		/** True while this group is the live one. */
		live: boolean;
		copy?: Partial<ChatCopy>;
	}

	let { group, live, copy }: Props = $props();
</script>

<div class="ds-lib-activity-steps">
	{#each group.steps as step, i (step.block.index)}
		{#if step.block.kind === 'tool'}
			<ToolRow block={step.block} words={step.words} running={live} {copy} />
		{:else}
			<ThinkingRow block={step.block} active={live && i === group.steps.length - 1} />
		{/if}
	{/each}
</div>

<style>
	.ds-lib-activity-steps {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
</style>
