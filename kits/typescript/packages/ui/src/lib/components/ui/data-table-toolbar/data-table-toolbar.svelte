<script lang="ts" module>
	import type { Status } from '../status/index.js';
	import type { Snippet } from 'svelte';

	export type ChipSpec = {
		/** Wire value passed to setFilterValue / 'all' for "no filter". */
		value: string;
		/** Button label text. */
		label: string;
		/** Chip colour from the status palette. */
		status: Status;
	};

	export type ChipGroup = {
		/** Matches the TanStack column id this group filters. */
		columnId: string;
		chips: ChipSpec[];
		/** Currently active filter value ('all' = no filter). */
		activeValue: string;
		/** Called when a chip is pressed. */
		onSelect: (value: string) => void;
	};

	export interface DataTableToolbarProps {
		/** Bound to the table's globalFilter state. */
		searchValue: string;
		onSearch: (value: string) => void;
		searchPlaceholder?: string;
		/** Zero or more chip groups rendered left-to-right after the search field. */
		chipGroups?: ChipGroup[];
		/** Optional trailing slot content (e.g. a "Last 200 events" meta line). */
		trailing?: Snippet;
	}
</script>

<script lang="ts">
	/**
	 * DataTableToolbar — shared toolbar for TanStack-backed data tables.
	 *
	 * Renders:
	 *  - a search input bound to the table's global filter
	 *  - inline toggle chip groups, one per filter dimension
	 *
	 * Chip groups drive a single TanStack column filter each:
	 *   { columnId, chips: [{ value, label, status }] }
	 *
	 * The toolbar does NOT own state; it takes the current values and fires
	 * callbacks so the parent page keeps the single source of truth.
	 */

	import Search from '@lucide/svelte/icons/search';

	let {
		searchValue,
		onSearch,
		searchPlaceholder = 'Filter…',
		chipGroups = [],
		trailing
	}: DataTableToolbarProps = $props();
</script>

<div class="mb-4 flex flex-wrap items-center gap-3">
	<!-- Search input: full width on phones (where it owns its own wrapped row),
	     the clamped instrument width from sm up. -->
	<div class="relative w-full flex-none sm:w-[clamp(360px,42vw,720px)]">
		<Search
			class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
		/>
		<input
			class="bg-background border-border focus:border-ring w-full rounded-md border py-2 pr-3 pl-8 text-sm outline-none"
			placeholder={searchPlaceholder}
			type="search"
			value={searchValue}
			oninput={(e) => onSearch((e.target as HTMLInputElement).value)}
		/>
	</div>

	<!-- Chip groups -->
	{#each chipGroups as group (group.columnId)}
		<div class="flex items-center gap-1.5">
			{#each group.chips as chip (chip.value)}
				<button
					type="button"
					aria-pressed={group.activeValue === chip.value}
					class="ds-chip {group.activeValue === chip.value
						? `ds-chip-${chip.status}`
						: 'ds-chip-neutral'}"
					onclick={() => group.onSelect(chip.value)}
				>
					{chip.label}
				</button>
			{/each}
		</div>
	{/each}

	<!-- Trailing content -->
	{#if trailing}
		<span class="ml-auto">
			{@render trailing()}
		</span>
	{/if}
</div>
