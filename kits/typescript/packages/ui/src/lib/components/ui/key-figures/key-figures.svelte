<script lang="ts" module>
	import type { Status } from '../status/index.js';

	/** One of a page's key figures: a StatCard's label, value, unit, sub and states. */
	export interface KeyFigure {
		label: string;
		value: string | number;
		unit?: string;
		/** Under the figure: what it is measured against, or what changed. */
		sub?: string;
		/** The state of what is measured: its glyph beside the label. */
		status?: Status;
		/** The figure's own ink, its sign; `neutral` keeps a healthy zero quiet. */
		valueTone?: Status;
	}
</script>

<script lang="ts">
	/**
	 * A page's key figures in one row, under its lead: each a StatCard, open,
	 * as wide as its figure, with a hairline between two, so three numbers read
	 * as three numbers and not three tiles. Crowded, the row wraps and a line
	 * starts without a rule. No icon on a figure: its label names it.
	 */
	import type { HTMLAttributes } from 'svelte/elements';
	import StatCard from '../stat-card/stat-card.svelte';
	import { cn } from '#lib/utils.js';

	let {
		figures,
		label = 'Key figures',
		class: className,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		figures: readonly KeyFigure[];
		/** The row's accessible name. */
		label?: string;
	} = $props();
</script>

<!-- The rule sits in the gap, left of each figure; the row clips the one left of a line's first. -->
<div
	role="list"
	aria-label={label}
	data-slot="key-figures"
	class={cn('flex min-w-0 flex-wrap gap-x-12 gap-y-6 overflow-hidden', className)}
	{...restProps}
>
	{#each figures as figure (figure.label)}
		<div
			role="listitem"
			class="before:bg-border relative min-w-28 before:absolute before:inset-y-0 before:-left-6 before:w-px"
		>
			<StatCard {...figure} />
		</div>
	{/each}
</div>
