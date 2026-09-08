<!--
  One tool call, as a row in the transcript.

  Not a card: a status dot, an action in bold, its target beside it, one
  dimmed sub-line. Borders and badge pills make a run of five calls read as
  five separate events rather than one train of thought.

  The row says what the agent is DOING, not what it typed. A reader here is
  asking about documents, not reading a terminal, and `Bash ls -1 .` looks
  like a leak from the machine room. The raw command is one click away, so
  nothing is hidden from anyone who wants it.
-->
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { describe, summarise, type ToolBlock } from '../../transcript.svelte';

	interface Props {
		block: ToolBlock;
		running: boolean;
		/** Identical consecutive steps folded into this row — five pages of one
		 *  document is one act of reading to a human. */
		repeats?: number;
	}

	let { block, running, repeats = 1 }: Props = $props();
	let open = $state(false);

	const settled = $derived(block.result !== undefined);
	const said = $derived(describe(block));
	const tone = $derived(
		block.isError ? 'bg-status-error' : settled ? 'bg-status-success' : 'bg-status-info'
	);
	const lines = $derived(block.result ? block.result.split('\n').length : 0);
</script>

<div class="text-sm">
	<button
		type="button"
		class="flex w-full items-center gap-2 rounded py-0.5 text-left"
		onclick={() => (open = !open)}
		disabled={!settled}
		aria-expanded={open}
	>
		<span class="flex w-3 shrink-0 items-center justify-center">
			{#if settled}
				<ChevronRightIcon
					class="text-muted-foreground size-3 transition-transform {open ? 'rotate-90' : ''}"
				/>
			{/if}
		</span>
		<span class="size-1.5 shrink-0 rounded-full {tone} {!settled && running ? 'animate-pulse' : ''}"
		></span>
		<span class="text-muted-foreground truncate">
			<span class="text-foreground font-medium">{said.verb}</span>
			{#if said.object}<span class="text-foreground/80">{said.object}</span>{/if}
			{#if repeats > 1}<span class="text-muted-foreground">· {repeats} sections</span>{/if}
		</span>
	</button>

	{#if open}
		<div class="border-border mt-1 ml-5.5 border-l pl-3">
			<!-- The real command, for anyone who wants it. -->
			<p class="text-muted-foreground font-mono text-xs break-all">
				{block.name}
				{summarise(block)}
			</p>
			{#if block.result}
				<pre
					class="text-muted-foreground mt-1 max-h-72 overflow-auto font-mono text-xs whitespace-pre-wrap">{block.result}</pre>
			{/if}
		</div>
	{:else if settled && lines > 0}
		<p class="text-muted-foreground pl-5.5 text-xs">
			{lines === 1 ? '1 line' : `${lines} lines`}
		</p>
	{/if}
</div>
