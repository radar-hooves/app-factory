<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { ThinkingBlock } from '../../transcript.svelte';

	interface Props {
		block: ThinkingBlock;
		active: boolean;
	}

	let { block, active }: Props = $props();
	let open = $state(false);
</script>

<div class="text-sm">
	<button
		type="button"
		class="flex items-center gap-2 py-0.5 text-left"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		<ChevronRightIcon
			class="text-muted-foreground size-3 transition-transform {open ? 'rotate-90' : ''}"
		/>
		<span class={active ? 'text-foreground font-medium' : 'text-muted-foreground'}>
			{active ? 'Thinking…' : 'Thought'}
		</span>
	</button>
	{#if open}
		<p
			class="text-muted-foreground border-border mt-1 ml-1.25 border-l pl-3 text-sm whitespace-pre-wrap"
		>
			{block.text}
		</p>
	{/if}
</div>
