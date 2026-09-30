<script lang="ts" module>
	import type { Status } from '../status/index.js';

	export interface StatItem {
		/** Uppercase eyebrow label. */
		label: string;
		/** The figure. Numbers render mono + tabular. */
		value: string | number;
		/** Optional status; shows a dot beside the value, unless muted. */
		status?: Status;
		/** Render quiet (e.g. a healthy zero): dims the value and suppresses the dot. */
		muted?: boolean;
		/** Optional small trailing unit/sub next to the value (e.g. "/ 1"). */
		sub?: string;
	}
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { WithElementRef } from '$lib/utils.js';
	import InfoTip from '../info-tip/info-tip.svelte';

	// The standing metric card for the right-hand context column: a route's
	// low-context integers stacked as a vertical label→value list inside one card,
	// in place of a full-width metric band. One per route, titled identically, so
	// the context column reads the same everywhere. Zero-aware: pass muted for a
	// healthy zero so it stays quiet and a real non-zero stands out.
	let {
		items,
		title = 'At a glance',
		info,
		class: klass = '',
		ref = $bindable(null),
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		items: StatItem[];
		title?: string;
		info?: string;
	} = $props();
</script>

<section
	bind:this={ref}
	class="bg-card border-border ds-edge flex shrink-0 flex-col overflow-hidden rounded-lg border {klass}"
	{...restProps}
>
	<header class="border-border flex items-center gap-2 border-b px-4 py-3">
		<h2 class="text-body leading-tight font-semibold tracking-tight">{title}</h2>
		{#if info}
			<InfoTip
				text={info}
				class="text-muted-foreground/50 hover:text-muted-foreground size-3.5 transition-colors"
			/>
		{/if}
	</header>
	<dl class="flex flex-col">
		{#each items as item (item.label)}
			<div
				class="border-border/60 flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-0"
			>
				<dt class="text-muted-foreground text-2xs tracking-eyebrow font-medium uppercase">
					{item.label}
				</dt>
				<dd class="flex items-center gap-1.5">
					{#if item.status && !item.muted}
						<span class="ds-dot ds-dot-{item.status}"></span>
					{/if}
					<span
						class="ds-tabular text-stat font-mono leading-none font-semibold {item.muted
							? 'text-muted-foreground/60'
							: ''}">{item.value}</span
					>
					{#if item.sub}
						<span class="text-muted-foreground text-xs">{item.sub}</span>
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
</section>
