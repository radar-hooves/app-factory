<!--
  One Vega-Lite v5 spec, drawn with the app's own tokens. The persona writes
  the data and the marks; colour, type, axes and size come from here and
  override whatever the spec says. Loaded on demand: vega is not small.
-->
<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		value: unknown;
		source: string;
	}

	let { value, source }: Props = $props();
	let host = $state<HTMLDivElement | null>(null);
	let failed = $state(false);

	const css = (name: string): string =>
		getComputedStyle(document.documentElement).getPropertyValue(name).trim();

	function config() {
		const ink = css('--ds-color-foreground') || '#231f20';
		const muted = css('--ds-color-muted-foreground') || '#57595c';
		const line = css('--ds-color-border-strong') || '#00000038';
		const font = getComputedStyle(document.body).fontFamily;
		const series = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => css(`--chart-${i}`)).filter(Boolean);
		return {
			background: null,
			font,
			...(series.length > 0 ? { range: { category: series } } : {}),
			mark: { color: series[0] ?? ink },
			bar: { cornerRadius: 1 },
			view: { stroke: null },
			axis: {
				labelColor: muted,
				titleColor: muted,
				domainColor: line,
				tickColor: line,
				gridColor: line,
				gridOpacity: 0.5,
				labelFont: font,
				titleFont: font,
				labelFontSize: 12,
				titleFontSize: 12,
				titleFontWeight: 600
			},
			legend: { labelColor: ink, titleColor: muted, labelFont: font, titleFont: font },
			title: { color: ink, font, fontSize: 14, fontWeight: 600, anchor: 'start' }
		};
	}

	let latest = 0;
	// The view drawn last, ended before the next is drawn and when the chart goes.
	let drawn: { finalize: () => void } | undefined;
	async function draw() {
		if (!host) return;
		const mine = ++latest;
		try {
			const { default: embed } = await import('vega-embed');
			if (mine !== latest) return;
			const { $schema: _schema, config: _config, usermeta: _usermeta, ...spec } = value as Record<string, unknown>;
			drawn?.finalize();
			drawn = await embed(
				host,
				{ ...spec, width: 'container', autosize: { type: 'fit', contains: 'padding' } } as never,
				{ actions: false, renderer: 'svg', config: config() as never }
			);
			failed = false;
		} catch {
			if (mine === latest) failed = true;
		}
	}

	onMount(() => {
		// The palette follows the theme, and the theme is a class on the root.
		const watch = new MutationObserver(() => void draw());
		watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		return () => {
			watch.disconnect();
			drawn?.finalize();
		};
	});

	$effect(() => {
		void value;
		void host;
		void draw();
	});
</script>

{#if failed}
	<pre data-highlighted="true"><code>{source}</code></pre>
{:else}
	<figure class="ds-lib-chart"><div bind:this={host} class="ds-lib-chart-host"></div></figure>
{/if}

<style>
	.ds-lib-chart {
		margin: 0.75em 0;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-lg);
		background: var(--ds-color-surface-1);
		padding: 0.75rem 0.875rem;
	}

	.ds-lib-chart-host {
		width: 100%;
		min-height: 6rem;
	}
</style>
