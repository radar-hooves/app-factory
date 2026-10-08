<script lang="ts">
	// Fixture for cell-reactive.test.ts: one markup snippet serving two columns
	// built at runtime, told apart by the column the list passes it.
	import { createRawSnippet } from 'svelte';
	import RecordList from '$lib/components/ui/record-list';
	import type { RecordListColumn, RecordListRow } from '$lib/components/ui/record-list';
	import type { ListColumn } from '$lib/components/ui/ledger/types.js';

	type Row = RecordListRow & { total: number; other: number };
	let { rows }: { rows: Row[] } = $props();

	const raw = createRawSnippet<[Row]>((row) => ({
		render: () => `<span data-probe="raw">${row().total}</span>`
	}));
	const columns: RecordListColumn<Row>[] = [
		{ key: 'raw', label: 'Raw', cell: raw },
		{ key: 'total', label: 'Total', cell: figure },
		{ key: 'other', label: 'Other', cell: figure }
	];
</script>

{#snippet figure(r: Row, c: ListColumn<Row>)}
	<span data-probe={c.key}>{r[c.key as 'total' | 'other']}</span>
{/snippet}

<RecordList {rows} {columns} layout="narrow" />
