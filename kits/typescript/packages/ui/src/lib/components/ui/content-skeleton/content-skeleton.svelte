<script lang="ts" module>
	export type ContentSkeletonShape = 'rows' | 'tiles' | 'prose';
</script>

<script lang="ts">
	/**
	 * A region of a page while its data loads, drawn in the shape of what will
	 * replace it: `rows` for a RecordList or a table, `tiles` for StatCards or a
	 * card grid, `prose` for a document body. The page renders its PageHeader
	 * for real and this in place of the region; a whole page still waiting on
	 * everything is LoadingState's (`sveltekit-ui-patterns.md` §Loading).
	 *
	 * Each shape is sized to the component it stands in for (a RecordList row is
	 * 2.5rem of text in 0.625rem of padding, a StatCard a label, a display
	 * figure and a line), so the swap moves nothing. One app had five sizes of
	 * bare Skeleton box for this, none matching what loaded.
	 */
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import Skeleton from '../skeleton/skeleton.svelte';

	let {
		shape = 'rows',
		count,
		label = 'Loading…',
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		shape?: ContentSkeletonShape;
		/** Rows, tiles, or paragraphs. Defaults to 5, 4 and 3. */
		count?: number;
		/** What a screen reader hears while it stands. */
		label?: string;
	} = $props();

	const n = $derived(count ?? { rows: 5, tiles: 4, prose: 3 }[shape]);
	// Varied, but fixed: a skeleton that changed width on every render would
	// read as motion.
	const TITLE = ['w-2/5', 'w-3/5', 'w-1/2', 'w-2/3', 'w-1/3'];
	const NOTE = ['w-1/4', 'w-1/3', 'w-1/5', 'w-2/5'];
	const LAST_LINE = ['w-3/5', 'w-2/5', 'w-4/5'];
</script>

<div
	bind:this={ref}
	role="status"
	aria-live="polite"
	aria-busy="true"
	data-slot="content-skeleton"
	data-shape={shape}
	class={cn('@container min-w-0', className)}
	{...restProps}
>
	<span class="sr-only">{label}</span>
	{#if shape === 'rows'}
		<div class="bg-card border-border ds-edge divide-border divide-y rounded-lg border" aria-hidden="true">
			{#each { length: n }, i (i)}
				<div class="flex flex-col gap-1 px-3 py-2.5">
					<div class="flex h-5 items-center">
						<Skeleton class={cn('h-3.5', TITLE[i % TITLE.length])} />
					</div>
					<div class="flex h-4 items-center">
						<Skeleton class={cn('h-3', NOTE[i % NOTE.length])} />
					</div>
				</div>
			{/each}
		</div>
	{:else if shape === 'tiles'}
		<div class="grid grid-cols-1 gap-4 @sm:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4" aria-hidden="true">
			{#each { length: n }, i (i)}
				<div class="bg-card border-border ds-edge flex flex-col gap-1.5 rounded-lg border p-4">
					<div class="flex h-4 items-center"><Skeleton class="h-2.5 w-1/3" /></div>
					<div class="flex h-[2.125rem] items-center"><Skeleton class="h-6 w-1/2" /></div>
					<div class="flex h-4 items-center">
						<Skeleton class={cn('h-3', NOTE[i % NOTE.length])} />
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="ds-measure flex flex-col gap-5" data-measure="prose" aria-hidden="true">
			{#each { length: n }, i (i)}
				<div class="flex flex-col">
					{#each { length: 4 }, line (line)}
						<div class="flex h-6 items-center">
							<Skeleton class={cn('h-3.5', line === 3 ? LAST_LINE[i % LAST_LINE.length] : 'w-full')} />
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>
