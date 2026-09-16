<!--
  One tool call, as a row in the transcript.

  Not a card: a status dot, an action in bold, its target beside it, one
  dimmed sub-line. Borders and badge pills make a run of five calls read as
  five separate events rather than one train of thought.

  The row says what the persona DID, in a reader's own words — never the
  tool's name or the raw command it ran. Expanding a settled row shows what
  came back, never what was typed.
-->
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { describe, type ToolBlock } from '../../transcript.svelte';

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
	const tone = $derived(block.isError ? 'error' : settled ? 'success' : 'info');
	const lines = $derived(block.result ? block.result.split('\n').length : 0);
</script>

<div class="ds-lib-tool">
	<button
		type="button"
		class="ds-lib-tool-row"
		onclick={() => (open = !open)}
		disabled={!settled}
		aria-expanded={open}
	>
		<span class="ds-lib-tool-chevron" class:is-open={open}>
			{#if settled}<ChevronRightIcon size={12} />{/if}
		</span>
		<span class="ds-lib-tool-dot" data-tone={tone} class:is-live={!settled && running}></span>
		<span class="ds-lib-tool-said">
			<span class="ds-lib-tool-verb">{said.verb}</span>
			{#if said.object}<span class="ds-lib-tool-object">{said.object}</span>{/if}
			{#if repeats > 1}<span>· {repeats} pages</span>{/if}
		</span>
	</button>

	{#if open}
		<div class="ds-lib-tool-body">
			{#if block.result}
				<pre class="ds-lib-tool-result">{block.result}</pre>
			{/if}
		</div>
	{:else if settled && lines > 0}
		<p class="ds-lib-tool-lines">{lines === 1 ? '1 line' : `${lines} lines`}</p>
	{/if}
</div>

<style>
	.ds-lib-tool {
		font-size: 0.875rem;
		line-height: 1.25rem;
	}

	.ds-lib-tool-row {
		display: flex;
		width: 100%;
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

	.ds-lib-tool-row:disabled {
		cursor: default;
	}

	.ds-lib-tool-chevron {
		display: flex;
		width: 0.75rem;
		flex: none;
		align-items: center;
		justify-content: center;
		color: var(--ds-color-muted-foreground);
		transition: transform 150ms ease;
	}

	.ds-lib-tool-chevron.is-open {
		transform: rotate(90deg);
	}

	.ds-lib-tool-dot {
		width: 0.375rem;
		height: 0.375rem;
		flex: none;
		border-radius: var(--ds-radius-full);
		background: var(--ds-color-status-info);
	}

	.ds-lib-tool-dot[data-tone='error'] {
		background: var(--ds-color-status-error);
	}

	.ds-lib-tool-dot[data-tone='success'] {
		background: var(--ds-color-status-success);
	}

	.ds-lib-tool-dot.is-live {
		animation: ds-lib-tool-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	.ds-lib-tool-said {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-tool-verb {
		color: var(--ds-color-foreground);
		font-weight: 500;
	}

	.ds-lib-tool-object {
		color: color-mix(in oklab, var(--ds-color-foreground) 80%, transparent);
	}

	.ds-lib-tool-body {
		margin-top: 0.25rem;
		margin-inline-start: 1.375rem;
		border-inline-start: 1px solid var(--ds-color-border);
		padding-inline-start: 0.75rem;
	}

	.ds-lib-tool-result {
		margin-top: 0.25rem;
		max-height: 18rem;
		overflow: auto;
		color: var(--ds-color-muted-foreground);
		font-family: var(--ds-font-code);
		font-size: var(--ds-text-2xs);
		white-space: pre-wrap;
	}

	.ds-lib-tool-lines {
		margin: 0;
		padding-inline-start: 1.375rem;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}

	@keyframes ds-lib-tool-pulse {
		50% {
			opacity: 0.4;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ds-lib-tool-dot.is-live {
			animation: none;
		}

		.ds-lib-tool-chevron {
			transition: none;
		}
	}
</style>
