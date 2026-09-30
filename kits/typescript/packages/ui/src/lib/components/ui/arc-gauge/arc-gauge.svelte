<script lang="ts" module>
	import type { Status } from '../status/index.js';

	// The gauge's tone is a health read, not the full five-state vocabulary —
	// info/neutral have no caller today, so the type stays a named subset
	// rather than widening to all of Status speculatively.
	export type GaugeTone = Extract<Status, 'success' | 'warning' | 'error'>;
</script>

<script lang="ts">
	import type { SVGAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	// Radial capacity/percentage gauge: a compact SVG ring for a single 0–100
	// metric where a StatCard's full metric tile would be too heavy — a
	// token-burn dial, a rate-limit-window ring. `size` is both the viewBox
	// unit and the gauge's physical footprint, so a consumer picks its
	// on-screen size directly (36 for a small inline dial, 42 for a
	// standalone one) rather than trusting ambient sizing.
	let {
		pct = 0,
		tone = 'success',
		size = 42,
		showLabel = false,
		label = '',
		ref = $bindable(null),
		class: className,
		...restProps
	}: Omit<SVGAttributes<SVGSVGElement>, 'class'> & {
		pct?: number;
		tone?: GaugeTone;
		size?: number;
		showLabel?: boolean;
		label?: string;
		ref?: SVGSVGElement | null;
		class?: string;
	} = $props();

	const clampedPct = $derived(Math.max(0, Math.min(100, pct)));

	const toneVar: Record<GaugeTone, string> = {
		success: 'var(--ds-color-status-success)',
		warning: 'var(--ds-color-status-warning)',
		error: 'var(--ds-color-status-error)'
	};

	const cx = $derived(size / 2);
	const cy = $derived(size / 2);
	const r = $derived(size / 2 - 4);
	const circumference = $derived(2 * Math.PI * r);
	const offset = $derived(circumference * (1 - clampedPct / 100));
	const color = $derived(toneVar[tone] ?? toneVar.success);
	const big = $derived(size >= 40);
	const strokeWidth = 4;
</script>

<svg
	bind:this={ref}
	viewBox="0 0 {size} {size}"
	width={size}
	height={size}
	aria-label="{clampedPct}% used"
	class={cn(className)}
	{...restProps}
>
	<circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ds-color-surface-3)" stroke-width={strokeWidth} />
	<circle
		cx={cx}
		cy={cy}
		r={r}
		fill="none"
		stroke={color}
		stroke-width={strokeWidth}
		stroke-linecap="round"
		stroke-dasharray={circumference}
		stroke-dashoffset={offset}
		transform="rotate(-90 {cx} {cy})"
	/>
	{#if big && showLabel}
		<!--
			The percentage and unit-label glyphs below are graphic annotations
			scaled by the viewBox, not CSS/DOM running text — the household's
			~0.75rem type floor governs body copy, not a numeral drawn inside a
			purpose-built, self-contained radial gauge. Growing them to clear
			that floor would blow out the ring's established compact geometry
			(a 36–42 SVG-unit footprint), so they stay at their literal 10 and
			5.4 user-unit sizes deliberately (design-system#15).
		-->
		<text
			x={cx}
			y={cy - 0.5}
			text-anchor="middle"
			dominant-baseline="central"
			font-family="var(--ds-font-code)"
			font-size="10"
			font-weight="600"
			fill="var(--ds-color-foreground)"
		>{clampedPct}%</text>
		{#if label}
			<text
				x={cx}
				y={cy + 7.5}
				text-anchor="middle"
				dominant-baseline="central"
				font-family="var(--ds-font-body)"
				font-size="5.4"
				fill="var(--ds-color-muted-foreground)"
				letter-spacing="0.5"
			>{label.toUpperCase()}</text>
		{/if}
	{/if}
</svg>
