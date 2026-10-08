<script lang="ts">
	/**
	 * One column's head in a head card. A sortable column's head is a button:
	 * a click sorts (largest or newest first, unless `first` says otherwise),
	 * again reverses, a third time restores the list's own order.
	 */
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import { cn } from '$lib/utils.js';
	import { CELL, END, HEAD_TEXT, RING_INSET } from './look.js';

	let {
		label,
		name,
		align = 'start',
		sortable,
		sort,
		first = 'desc',
		onsort,
		owner,
		class: className
	}: {
		/** What the head says. */
		label: string;
		/** The column's whole name, for the sort button's label. */
		name: string;
		align?: 'start' | 'end';
		sortable: boolean;
		/** This column's sort, when it is the one in force. */
		sort: 'asc' | 'desc' | null;
		/** The direction the first click sorts in. */
		first?: 'asc' | 'desc';
		onsort: () => void;
		/** The `data-slot` prefix: the list that owns the head. */
		owner: string;
		class?: string;
	} = $props();

	const klass = $derived(cn(CELL, HEAD_TEXT, align === 'end' && END, className));
</script>

{#if sortable}
	<button
		type="button"
		class={cn(
			klass,
			'group flex cursor-pointer items-center gap-0.5 rounded-md hover:text-foreground',
			RING_INSET,
			align === 'end' && 'justify-end',
			sort && 'text-foreground'
		)}
		aria-label={sort
			? `Sorted by ${name}, ${sort === 'desc' ? 'descending' : 'ascending'}. Click ${sort === first ? 'to reverse' : 'for the default order'}`
			: `Sort by ${name}`}
		onclick={onsort}
		data-slot="{owner}-sort"
		data-sort={sort ?? undefined}
	>
		<span class="truncate">{label}</span>
		{#if sort === 'asc'}
			<ChevronUp class="size-3 flex-none" />
		{:else}
			<ChevronDown
				class={cn(
					'size-3 flex-none',
					!sort && 'opacity-0 group-hover:opacity-50 group-focus-visible:opacity-50'
				)}
			/>
		{/if}
	</button>
{:else}
	<span class={klass}>{label}</span>
{/if}
