<!--
  One tool call, as a row in the transcript.

  Not a card: a status dot, an action in bold, its target beside it, one
  dimmed sub-line. Borders and badge pills make a run of five calls read as
  five separate events rather than one train of thought.

  The row says what the persona DID, in a reader's own words — never the
  tool's name or the raw command it ran: the host's `DescribeTool`, or the
  package's own `describe()`. Expanding it shows what went in and what came
  back, the way Claude Code's own panel does.
-->
<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { describe, type ToolBlock, type ToolWords } from '../../transcript.svelte';
	import { resolveCopy, type ChatCopy } from '../../copy';

	interface Props {
		block: ToolBlock;
		running: boolean;
		/** The call in the persona's words. Absent takes the package's own. */
		words?: ToolWords;
		copy?: Partial<ChatCopy>;
	}

	let { block, running, words, copy }: Props = $props();
	let open = $state(false);

	const label = $derived(resolveCopy(copy));
	const settled = $derived(block.result !== undefined);
	const said = $derived(words ?? describe(block));
	const tone = $derived(block.isError ? 'error' : settled ? 'success' : 'info');
	// Pretty while it parses; the raw text while it is still arriving.
	const input = $derived.by(() => {
		try {
			const parsed: unknown = JSON.parse(block.rawInput);
			return typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length === 0
				? ''
				: JSON.stringify(parsed, null, 2);
		} catch {
			return block.rawInput;
		}
	});
</script>

<div class="ds-lib-tool">
	<button
		type="button"
		class="ds-lib-tool-row"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		<span class="ds-lib-tool-chevron" class:is-open={open}>
			<ChevronRightIcon size={12} />
		</span>
		<span class="ds-lib-tool-dot" data-tone={tone} class:is-live={!settled && running}></span>
		<span class="ds-lib-tool-said">
			<span class="ds-lib-tool-verb">{said.verb}</span>
			{#if said.object}<span class="ds-lib-tool-object">{said.object}</span>{/if}
		</span>
		{#if block.isError}<span class="ds-lib-tool-failed">{label.stepFailed}</span>{/if}
	</button>

	{#if open}
		<div class="ds-lib-tool-body">
			{#if input}
				<p class="ds-lib-tool-label">{label.stepInput}</p>
				<pre class="ds-lib-tool-result">{input}</pre>
			{/if}
			{#if block.result}
				<p class="ds-lib-tool-label">{label.stepResult}</p>
				<pre class="ds-lib-tool-result">{block.result}</pre>
			{/if}
		</div>
	{:else if said.detail}
		<p class="ds-lib-tool-lines">{said.detail}</p>
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
		margin: 0.125rem 0 0;
		max-height: 12rem;
		overflow: auto;
		color: var(--ds-color-muted-foreground);
		font-family: var(--ds-font-code);
		font-size: var(--ds-text-2xs);
		white-space: pre-wrap;
	}

	.ds-lib-tool-label {
		margin: 0.25rem 0 0;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.ds-lib-tool-failed {
		flex: none;
		color: var(--ds-color-status-error);
		font-size: var(--ds-text-2xs);
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
