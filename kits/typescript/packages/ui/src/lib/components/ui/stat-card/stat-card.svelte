<script lang="ts">
	import type { Status } from '../status/index.js';
	import type { Component } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	// A single metric, reserved for a figure that earns the space with real
	// context. A bare integer belongs in a StatList.
	let {
		label,
		value,
		unit,
		sub,
		status,
		valueTone,
		icon: Icon,
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		label: string;
		value: string | number;
		unit?: string;
		sub?: string;
		/** Lights the dot beside the LABEL: the state of the thing being measured. */
		status?: Status;
		/**
		 * Colours the FIGURE itself: the sign of the number, not the health of its
		 * source. They are different claims and a card often makes both — a feed
		 * that is connected (`status="success"`) reporting a loss (`valueTone
		 * "error"`).
		 *
		 * Without it, a negative P&L rendered in the default foreground with a
		 * coloured dot beside the label, which is the wrong element carrying the
		 * meaning: the eye goes to the figure, and the figure said nothing. Apps
		 * were reaching for a local StatCard for exactly this.
		 *
		 * Colour is a refinement, never the message — the figure still carries its
		 * own sign, so a reader who cannot tell the tones apart loses nothing
		 * (WCAG 1.4.1).
		 */
		valueTone?: Status;
		icon?: Component<{ class?: string }>;
	} = $props();
</script>

<div
	bind:this={ref}
	class={cn('bg-card border-border ds-edge flex flex-col gap-1.5 rounded-lg border p-4', className)}
	{...restProps}
>
	<div class="flex items-center gap-2">
		{#if Icon}
			<Icon class="text-muted-foreground size-4" />
		{/if}
		<span class="text-muted-foreground text-2xs tracking-eyebrow font-medium uppercase">
			{label}
		</span>
		{#if status}
			<span class="ds-dot ds-dot-{status} ml-auto"></span>
		{/if}
	</div>
	<div class="flex items-baseline gap-1.5">
		<span
			class="ds-tabular text-display font-mono leading-none font-semibold {valueTone
				? `ds-ink-${valueTone}`
				: ''}"
			data-tone={valueTone}>{value}</span
		>
		{#if unit}
			<span class="text-muted-foreground text-sm">{unit}</span>
		{/if}
	</div>
	{#if sub}
		<p class="text-muted-foreground text-xs">{sub}</p>
	{/if}
</div>
