<script lang="ts">
	// Harness for the TanStack-backed pair. It wires the real table instance the
	// way a consuming page does — external state, getter-based options — so the
	// tests drive genuine sorting / filtering / selection through the component
	// rather than asserting on a static render.
	import {
		getCoreRowModel,
		getFilteredRowModel,
		getSortedRowModel,
		type ColumnDef,
		type ColumnFiltersState,
		type SortingState
	} from '@tanstack/table-core';
	import { createSvelteTable } from '$lib/components/ui/data-table/index.js';
	import DataTableTanstack from '$lib/components/ui/data-table-tanstack/data-table-tanstack.svelte';
	import DataTableToolbar from '$lib/components/ui/data-table-toolbar/data-table-toolbar.svelte';
	import type { ChipGroup } from '$lib/components/ui/data-table-toolbar/data-table-toolbar.svelte';

	type Row = { id: string; name: string; state: string };

	const data: Row[] = [
		{ id: 'r1', name: 'charlie', state: 'success' },
		{ id: 'r2', name: 'alpha', state: 'error' },
		{ id: 'r3', name: 'bravo', state: 'success' }
	];

	const columns: ColumnDef<Row>[] = [
		{ accessorKey: 'name', header: 'Name' },
		{ accessorKey: 'state', header: 'State', filterFn: 'equalsString' },
		// The four columns below exist only to drive the meta class-slot tests in
		// composed-data-table.test.ts — one column per case (`class` alone,
		// `headClass` alone, `cellClass` alone, and the `class` + `cellClass`
		// combination that motivated the split in the first place).
		{ id: 'classOnly', header: 'Class Only', cell: () => 'both', meta: { class: 'meta-class-both' } },
		{
			id: 'headOnly',
			header: 'Head Only',
			cell: () => 'head-only',
			meta: { headClass: 'meta-head-only' }
		},
		{
			id: 'cellOnly',
			header: 'Cell Only',
			cell: () => 'cell-only',
			meta: { cellClass: 'meta-cell-only' }
		},
		{
			id: 'combo',
			header: 'Combo',
			cell: () => 'combo',
			// Mirrors the godswood truncating-column case: `w-full` lets the column
			// absorb leftover width, `max-w-0` (cell only) is what lets it ellipsis
			// instead of pushing every other column out — on the header it would
			// collapse the heading text instead.
			meta: { class: 'w-full', cellClass: 'max-w-0' }
		}
	];

	let sorting = $state<SortingState>([]);
	let globalFilter = $state('');
	let columnFilters = $state<ColumnFiltersState>([]);

	// Outcome signals the tests assert on — deliberately non-visual, so a passing
	// test means the callback actually fired, not that a row merely looks picked.
	let selectedId = $state<string | null>(null);
	let bulkSelection = $state<string[]>([]);
	let activeState = $state('all');

	// For exercising the component's imperative accessor rather than its callback.
	let tableRef: { getSelectedIds: () => string[] } | undefined = $state();
	let imperativeIds = $state('unread');

	const table = createSvelteTable<Row>({
		get data() {
			return data;
		},
		columns,
		state: {
			get sorting() {
				return sorting;
			},
			get globalFilter() {
				return globalFilter;
			},
			get columnFilters() {
				return columnFilters;
			}
		},
		globalFilterFn: 'includesString',
		onSortingChange: (updater) => {
			sorting = typeof updater === 'function' ? updater(sorting) : updater;
		},
		onGlobalFilterChange: (updater) => {
			globalFilter = typeof updater === 'function' ? updater(globalFilter) : updater;
		},
		onColumnFiltersChange: (updater) => {
			columnFilters = typeof updater === 'function' ? updater(columnFilters) : updater;
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel()
	});

	const chipGroups: ChipGroup[] = $derived([
		{
			columnId: 'state',
			activeValue: activeState,
			chips: [
				{ value: 'all', label: 'All', status: 'neutral' },
				{ value: 'success', label: 'Healthy', status: 'success' },
				{ value: 'error', label: 'Failed', status: 'error' }
			],
			onSelect: (value: string) => {
				activeState = value;
				table.getColumn('state')?.setFilterValue(value === 'all' ? undefined : value);
			}
		}
	]);
</script>

<button type="button" onclick={() => table.getColumn('name')?.toggleSorting(false)}>
	Sort by name
</button>

<DataTableToolbar
	searchValue={globalFilter}
	onSearch={(v) => table.setGlobalFilter(v)}
	searchPlaceholder="Filter rows…"
	{chipGroups}
/>

<button type="button" onclick={() => (imperativeIds = tableRef?.getSelectedIds().join(',') || 'none')}>
	Read selected ids
</button>

<DataTableTanstack
	bind:this={tableRef}
	{table}
	{selectedId}
	getRowId={(row) => row.id}
	onSelect={(id) => (selectedId = id)}
	selectable
	onSelectionChange={(ids) => (bulkSelection = ids)}
	emptyMessage="No rows match"
	emptyDescription="Loosen the filter."
/>

<!-- Non-visual outcome probes. -->
<output data-testid="selected-id">{selectedId ?? 'none'}</output>
<output data-testid="bulk-selection">{bulkSelection.join(',') || 'none'}</output>
<output data-testid="row-order">{table.getRowModel().rows.map((r) => r.original.name).join(',')}</output>
<output data-testid="imperative-ids">{imperativeIds}</output>
