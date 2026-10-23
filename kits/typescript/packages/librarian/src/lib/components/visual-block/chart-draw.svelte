<script lang="ts">
	import { AreaChart, BarChart, LineChart } from 'layerchart';
	import type { ChartValue } from '$lib/visuals';

	let { value }: { value: ChartValue } = $props();

	// `--chart-1` to `--chart-5` are the app's own series colours.
	const series = $derived(
		value.y.map((key, index) => ({ key, label: key, color: `var(--chart-${index + 1})` }))
	);
	const legend = $derived(series.length > 1);
	// A line or area over ISO dates is a time axis; anything else is the label it says.
	const data = $derived(
		value.type !== 'bar' && value.data.every((row) => /^\d{4}-\d{2}(-\d{2})?$/.test(String(row[value.x])))
			? value.data.map((row) => ({ ...row, [value.x]: new Date(String(row[value.x])) }))
			: value.data
	);
</script>

{#if value.type === 'bar'}
	<BarChart {data} x={value.x} {series} {legend} seriesLayout="group" props={{ bars: { strokeWidth: 0, radius: 2 } }} />
{:else if value.type === 'line'}
	<LineChart {data} x={value.x} {series} {legend} />
{:else}
	<AreaChart {data} x={value.x} {series} {legend} />
{/if}
