<!--
  One line of the persona's working-out, behind a chevron.

  Two different blocks render as this row and deliberately read the same. A
  real `thinking` block is one; the other is a `text` block written BETWEEN two
  tool calls — "Let me also check whether…" — which the caller stream gives no
  way to tell from the answer except by position, and which read as answer
  prose on production until `segment()` started re-homing it here. To a reader
  both are the same thing: what was being worked through, not what was
  concluded. So both fold, and both fold by default.
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

<div class="ds-lib-thinking">
	<button
		type="button"
		class="ds-lib-thinking-row"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		<span class="ds-lib-thinking-chevron" class:is-open={open}>
			<ChevronRightIcon size={12} />
		</span>
		<span class="ds-lib-thinking-label" class:is-active={active}>
			{active ? 'Thinking…' : 'Thought'}
		</span>
	</button>
	{#if open}
		<p class="ds-lib-thinking-text">{block.text}</p>
	{/if}
</div>

<style>
	.ds-lib-thinking {
		font-size: 0.875rem;
		line-height: 1.25rem;
	}

	.ds-lib-thinking-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-block: 0.125rem;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;
	}

	.ds-lib-thinking-chevron {
		display: flex;
		flex: none;
		color: var(--ds-color-muted-foreground);
		transition: transform 150ms ease;
	}

	.ds-lib-thinking-chevron.is-open {
		transform: rotate(90deg);
	}

	.ds-lib-thinking-label {
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-thinking-label.is-active {
		color: var(--ds-color-foreground);
		font-weight: 500;
	}

	.ds-lib-thinking-text {
		margin: 0.25rem 0 0;
		margin-inline-start: 0.3125rem;
		border-inline-start: 1px solid var(--ds-color-border);
		padding-inline-start: 0.75rem;
		color: var(--ds-color-muted-foreground);
		white-space: pre-wrap;
	}

	@media (prefers-reduced-motion: reduce) {
		.ds-lib-thinking-chevron {
			transition: none;
		}
	}
</style>
