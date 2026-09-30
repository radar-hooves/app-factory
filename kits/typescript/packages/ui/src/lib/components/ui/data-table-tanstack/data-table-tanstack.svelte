<script lang="ts" module>
	// Re-exported so a page importing the table also gets the column-def type from
	// one place, and never needs its own @tanstack/table-core dependency.
	export type { ColumnDef } from '@tanstack/table-core';

	// Module augmentation is TanStack's own extension point for `columnDef.meta`
	// (it ships as an empty interface for exactly this). Declaring it here means
	// every consumer importing `ColumnDef` from this package gets autocomplete
	// and a type error on a typo, with no cast anywhere in this component.
	declare module '@tanstack/table-core' {
		interface ColumnMeta<TData, TValue> {
			/** Applied to both the header (`<th>`) and body (`<td>`) cell. */
			class?: string;
			/** Applied to the header cell only, additive on top of `class`. */
			headClass?: string;
			/** Applied to the body cell only, additive on top of `class`. */
			cellClass?: string;
		}
	}
</script>

<script lang="ts" generics="TData">
	/**
	 * DataTableTanstack — shared TanStack-backed data table.
	 *
	 * Renders via the shadcn-svelte table primitives (Table, TableHeader, …) plus
	 * FlexRender. Supports:
	 *   - column defs with renderComponent / renderSnippet cell overrides
	 *   - global search (globalFilter state)
	 *   - per-column faceted filters (setFilterValue on a column)
	 *   - row selection for master-detail (onclick → selectedId, data-state=selected)
	 *   - custom row left-border style via getRowStyle
	 *   - responsive column hiding via column meta.class (both cells), or meta.headClass /
	 *     meta.cellClass for a class that must differ between the `<th>` and the `<td>`
	 *     (e.g. a truncating column needs `max-w-0` on the cell only — on the header it
	 *     collapses the heading text). All three are additive; the cell-specific slot
	 *     wins over `class` on a conflicting Tailwind utility.
	 *   - opt-in bulk row selection via `selectable` prop (leading checkbox column)
	 *
	 * The page owns the Table instance (createSvelteTable from
	 * `@poodle64/ui/data-table`); this component owns how it looks and how a row
	 * is picked.
	 */

	import type { Table } from '@tanstack/table-core';
	import {
		Table as TableRoot,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '../table/index.js';
	import { FlexRender } from '../data-table/index.js';
	import EmptyState from '../empty-state/empty-state.svelte';
	import { Checkbox } from '../checkbox/index.js';
	import type { Component } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { cn } from '$lib/utils.js';

	interface Props<TRow> {
		table: Table<TRow>;
		selectedId?: string | null;
		onSelect?: (id: string) => void;
		getRowId: (row: TRow) => string;
		getRowStyle?: (row: TRow) => string;
		selectedShadow?: string;
		emptyIcon?: Component<{ class?: string }>;
		emptyMessage?: string;
		emptyDescription?: string;
		/** Opt-in: render a leading checkbox column for multi-row selection. */
		selectable?: boolean;
		/** Called whenever the bulk selection changes. Receives the selected row ids. */
		onSelectionChange?: (ids: string[]) => void;
	}

	let {
		table,
		selectedId = null,
		onSelect,
		getRowId,
		getRowStyle,
		selectedShadow = 'box-shadow: inset 2px 0 0 0 var(--primary)',
		emptyIcon,
		emptyMessage = 'Nothing here',
		emptyDescription,
		selectable = false,
		onSelectionChange
	}: Props<TData> = $props();

	const rows = $derived(table.getRowModel().rows);
	const headerGroups = $derived(table.getHeaderGroups());

	// ── Bulk selection state ──────────────────────────────────────────────────────

	// SvelteSet tracks mutations reactively without $state wrapping.
	// All mutations use .add()/.delete()/.clear() to preserve reactivity.
	const selectedSet = new SvelteSet<string>();

	const allVisibleIds = $derived(rows.map((r) => getRowId(r.original)));
	const allSelected = $derived(
		allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedSet.has(id))
	);
	const someSelected = $derived(allVisibleIds.some((id) => selectedSet.has(id)) && !allSelected);

	function toggleAll(): void {
		// Read the derived BEFORE mutating the set it depends on: `allSelected`
		// recomputes on read, so clearing first makes it unconditionally false and
		// the branch below re-selects everything — a select-all that can never
		// deselect.
		const wasAllSelected = allSelected;
		selectedSet.clear();
		if (!wasAllSelected) {
			for (const id of allVisibleIds) selectedSet.add(id);
		}
		onSelectionChange?.([...selectedSet]);
	}

	function setRowSelected(id: string, selected: boolean): void {
		if (selected) selectedSet.add(id);
		else selectedSet.delete(id);
		onSelectionChange?.([...selectedSet]);
	}

	// Expose selected ids to parent (reactive accessor).
	export function getSelectedIds(): string[] {
		return [...selectedSet];
	}

	// Clear selection when visible rows change (e.g. after a filter or reload).
	$effect(() => {
		// Re-derive when allVisibleIds changes.
		void allVisibleIds;
		const toRemove = [...selectedSet].filter((id) => !allVisibleIds.includes(id));
		if (toRemove.length > 0) {
			for (const id of toRemove) selectedSet.delete(id);
			onSelectionChange?.([...selectedSet]);
		}
	});
</script>

<div
	class="bg-card border-border ds-edge flex max-h-full min-h-0 flex-col overflow-hidden rounded-lg border"
>
	{#if rows.length === 0}
		<EmptyState
			icon={emptyIcon}
			title={emptyMessage}
			description={emptyDescription}
			class="flex-1 rounded-none border-0"
		/>
	{:else}
		<div class="min-h-0 flex-1 overflow-auto">
			<TableRoot class="w-full">
				<TableHeader class="bg-card sticky top-0 z-10">
					{#each headerGroups as headerGroup (headerGroup.id)}
						<TableRow class="border-0 hover:bg-transparent">
							{#if selectable}
								<TableHead class="border-border w-10 border-b px-3 py-1.5">
									<Checkbox
										checked={allSelected}
										indeterminate={someSelected}
										onCheckedChange={toggleAll}
										aria-label="Select all rows"
									/>
								</TableHead>
							{/if}
							{#each headerGroup.headers as header (header.id)}
								{@const meta = header.column.columnDef.meta}
								<TableHead
									class={cn(
										'text-muted-foreground border-border text-2xs tracking-eyebrow border-b px-3 py-1.5 text-left font-medium whitespace-nowrap uppercase',
										meta?.class,
										meta?.headClass
									)}
								>
									{#if !header.isPlaceholder}
										<FlexRender
											content={header.column.columnDef.header}
											context={header.getContext()}
										/>
									{/if}
								</TableHead>
							{/each}
						</TableRow>
					{/each}
				</TableHeader>

				<TableBody>
					{#each rows as row (row.id)}
						{@const originalRow = row.original}
						{@const rowId = getRowId(originalRow)}
						{@const isSelected = rowId === selectedId}
						{@const isChecked = selectedSet.has(rowId)}
						{@const extraStyle = getRowStyle ? getRowStyle(originalRow) : ''}
						<TableRow
							data-state={isSelected ? 'selected' : undefined}
							class="border-border/60 border-b last:border-0 {onSelect
								? 'cursor-pointer hover:bg-[color-mix(in_oklch,var(--foreground)_4%,transparent)]'
								: ''} {isSelected ? 'bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]' : ''}"
							style="{extraStyle}{isSelected ? ' ' + selectedShadow : ''}"
							onclick={onSelect ? () => onSelect(rowId) : undefined}
							onkeydown={onSelect
								? (e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											onSelect(rowId);
										}
									}
								: undefined}
							tabindex={onSelect ? 0 : undefined}
						>
							{#if selectable}
								<TableCell class="w-10 px-3 py-1.5">
									<!-- The wrapper ONLY stops the event reaching the row, so ticking a
									     checkbox never also opens the master-detail. The checkbox's own
									     onCheckedChange is the single source of the selection change —
									     handling the click here as well would toggle twice per click and
									     net out to no selection at all. -->
									<div
										role="presentation"
										onclick={(e) => e.stopPropagation()}
										onkeydown={(e) => e.stopPropagation()}
									>
										<Checkbox
											checked={isChecked}
											onCheckedChange={(v) => setRowSelected(rowId, v)}
											aria-label="Select row"
										/>
									</div>
								</TableCell>
							{/if}
							{#each row.getVisibleCells() as cell (cell.id)}
								{@const meta = cell.column.columnDef.meta}
								<TableCell
									class={cn('px-3 py-1.5 text-sm whitespace-nowrap', meta?.class, meta?.cellClass)}
								>
									<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
								</TableCell>
							{/each}
						</TableRow>
					{/each}
				</TableBody>
			</TableRoot>
		</div>
	{/if}
</div>
