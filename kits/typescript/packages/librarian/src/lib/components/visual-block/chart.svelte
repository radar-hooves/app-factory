<!--
  One chart block, drawn with LayerChart in the app's chart tokens. The persona
  writes the data and the kind; colour, type, axes and size come from here.
  LayerChart is loaded when an answer carries a chart, never with the page.
-->
<script lang="ts">
	import type { Component } from 'svelte';
	import type { ChartValue } from '$lib/visuals';

	interface Props {
		value: unknown;
		source: string;
	}

	let { value, source }: Props = $props();
	const chart = $derived(value as ChartValue);
	let Draw = $state<Component<{ value: ChartValue }> | null>(null);
	let failed = $state(false);

	$effect(() => {
		if (Draw || failed) return;
		import('./chart-draw.svelte').then(
			(module) => (Draw = module.default),
			() => (failed = true)
		);
	});
</script>

{#if failed}
	<pre data-highlighted="true"><code>{source}</code></pre>
{:else}
	<figure class="ds-lib-chart">
		{#if chart.title}<figcaption class="ds-lib-chart-title">{chart.title}</figcaption>{/if}
		<div class="ds-lib-chart-host">
			{#if Draw}<Draw value={chart} />{/if}
		</div>
	</figure>
{/if}

<style>
	.ds-lib-chart {
		margin: 0.75em 0;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-lg);
		background: var(--ds-color-surface-1);
		padding: 0.75rem 0.875rem;
	}

	.ds-lib-chart-title {
		margin-bottom: 0.5rem;
		color: var(--ds-color-foreground);
		font-size: 0.875rem;
		font-weight: 600;
	}

	.ds-lib-chart-host {
		width: 100%;
		height: 16rem;
	}

	.ds-lib-chart-host :global(text) {
		fill: var(--ds-color-muted-foreground);
		stroke: none;
		font-size: 12px;
	}

	.ds-lib-chart-host :global(.lc-rule),
	.ds-lib-chart-host :global(.lc-axis-tick),
	.ds-lib-chart-host :global(.lc-grid-x-line),
	.ds-lib-chart-host :global(.lc-grid-y-line) {
		stroke: var(--ds-color-border-strong);
	}
</style>
