<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	// A labelled horizontal bar with a trailing value: a ranked-list row (a
	// token-burn chart, a per-lane usage table) where a full StatCard or
	// StatList row would be too heavy. `color` is a free CSS colour string
	// rather than the shared Status vocabulary — real callers pick an
	// arbitrary per-row colour (rank order, a per-series hue), not a health
	// state.
	let {
		label,
		value,
		pct,
		color = 'var(--ds-color-primary)',
		labelWidth = '8.5rem',
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		label: string;
		value: string | number;
		pct: number;
		color?: string;
		labelWidth?: string;
	} = $props();

	const clampedPct = $derived(Math.max(0, Math.min(100, pct)));
</script>

<div
	bind:this={ref}
	class={cn('grid items-center gap-[0.7rem] py-[0.28rem]', className)}
	style="grid-template-columns: {labelWidth} 1fr 2.6rem"
	{...restProps}
>
	<span class="text-foreground truncate text-sm">{label}</span>
	<span class="bg-surface-3 h-2 overflow-hidden rounded-full">
		<span class="block h-full rounded-full" style="width: {clampedPct}%; background: {color}"></span>
	</span>
	<span class="ds-tabular text-muted-foreground text-right font-mono text-sm">{value}</span>
</div>
