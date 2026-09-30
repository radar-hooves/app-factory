<script lang="ts" module>
	export interface Series {
		vals: number[];
		color: string;
	}
</script>

<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	// An inline area + line trend: a compact multi-series sparkline for a
	// row or card that has room for a trend but not a full Tier-1 chart
	// (see the household charting rule). Each series carries its own colour,
	// so the component owns no palette of its own.
	let {
		series,
		width,
		height,
		pad = 8,
		ref = $bindable(null),
		class: className,
		...restProps
	}: Omit<SVGAttributes<SVGSVGElement>, 'class' | 'width' | 'height'> & {
		series: Series[];
		width: number;
		height: number;
		pad?: number;
		ref?: SVGSVGElement | null;
		class?: string;
	} = $props();

	function buildPaths(vals: number[], w: number, h: number, p: number) {
		// A series with 0 or 1 points has no interval to spread across the
		// width, and an all-zero series has no range to spread across the
		// height — both zero denominators a real caller can legitimately hand
		// in (a freshly-created lane, a metric that hasn't moved yet), so they
		// degrade to a flat/empty render rather than emitting NaN coordinates
		// into the path data.
		const n = vals.length;
		if (n === 0) {
			return { line: '', area: '', lastX: p, lastY: h - p };
		}
		const max = Math.max(...vals) * 1.12 || 1;
		const min = 0;
		const xFn = (i: number) => (n === 1 ? p : p + (i / (n - 1)) * (w - 2 * p));
		const yFn = (v: number) => h - p - ((v - min) / (max - min)) * (h - 2 * p);

		let line = '';
		vals.forEach((v, i) => {
			const coord = `${xFn(i).toFixed(1)},${yFn(v).toFixed(1)}`;
			line += (i ? 'L' : 'M') + coord + ' ';
		});
		const area =
			line +
			`L ${xFn(n - 1).toFixed(1)},${(h - p).toFixed(1)} L ${xFn(0).toFixed(1)},${(h - p).toFixed(1)} Z`;
		const lastX = xFn(n - 1);
		const lastY = yFn(vals[n - 1]);
		return { line, area, lastX, lastY };
	}

	const gridLines = $derived.by(() => {
		const lines: string[] = [];
		for (let g = 1; g <= 3; g++) {
			const yy = height - pad - (g / 4) * (height - 2 * pad);
			lines.push(`M${pad},${yy.toFixed(1)} L${(width - pad).toFixed(1)},${yy.toFixed(1)}`);
		}
		return lines;
	});

	const paths = $derived(series.map((s) => ({ ...buildPaths(s.vals, width, height, pad), color: s.color })));
</script>

<svg
	bind:this={ref}
	viewBox="0 0 {width} {height}"
	preserveAspectRatio="none"
	style="display:block;width:100%;height:{height}px"
	class={cn(className)}
	{...restProps}
>
	{#each gridLines as d}
		<path {d} stroke="var(--ds-color-border)" stroke-width="0.5" opacity="0.5" fill="none" />
	{/each}
	{#each paths as p}
		<path d={p.area} fill={p.color} opacity="0.13" />
		<path d={p.line} fill="none" stroke={p.color} stroke-width="1.8" stroke-linejoin="round" />
		<circle cx={p.lastX.toFixed(1)} cy={p.lastY.toFixed(1)} r="2.4" fill={p.color} />
	{/each}
</svg>
