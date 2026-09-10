<!--
  One line of Milton's working-out, behind a chevron.

  Two different blocks render as this row and deliberately read the same. A
  real `thinking` block is one; the other is a `text` block Milton wrote
  BETWEEN two tool calls — "Let me also check whether…" — which the caller
  stream gives no way to tell from the answer except by position, and which
  read as answer prose on production until `segment()` started re-homing it
  here. To a reader both are the same thing: what he was working through, not
  what he concluded. So both fold, and both fold by default.
-->
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { TextBlock, ThinkingBlock } from '../../transcript.svelte';

	interface Props {
		block: ThinkingBlock | TextBlock;
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
