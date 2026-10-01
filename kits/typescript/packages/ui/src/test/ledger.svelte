<script lang="ts">
	// Fixture for ledger.test.ts: a consumer's wiring, with probes for what the
	// ledger emits. The bulk action, the editor and the origin action are the
	// consumer's own markup, which is the point: the ledger only places them.
	import Ledger from '$lib/components/ui/ledger';
	import type {
		LedgerColumn,
		LedgerOpenContext,
		LedgerPreferences,
		LedgerRow
	} from '$lib/components/ui/ledger';

	type Row = LedgerRow & { category?: string };

	let {
		rows,
		columns = [],
		preferences,
		layout = 'narrow',
		withBulk = true,
		withEditor = true,
		fyStart,
		onAttachment
	}: {
		rows: Row[];
		columns?: LedgerColumn<Row>[];
		preferences?: Partial<LedgerPreferences>;
		layout?: 'phone' | 'narrow' | 'wide';
		withBulk?: boolean;
		withEditor?: boolean;
		fyStart?: number;
		onAttachment?: (row: Row) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let prefs = $state(preferences);
	let emitted = $state<LedgerPreferences[]>([]);
	let selected = $state<Row['id'][]>([]);
	let open = $state<Row['id'] | null>(null);
	let acted = $state('');
</script>

{#snippet bulk(ticked: Row[])}
	<button type="button" onclick={() => (acted = ticked.map((r) => r.id).join(','))}>
		Mark reviewed
	</button>
{/snippet}

{#snippet edit(row: Row, ctx: LedgerOpenContext)}
	<div data-probe="editor">
		Editing {row.title}
		<span data-probe="amount-line">{ctx.column('amount')}</span>
		<button type="button" onclick={ctx.close}>Close</button>
	</div>
{/snippet}

{#snippet undo(row: Row)}
	<button type="button" onclick={() => (acted = `undo ${row.id}`)}>Undo</button>
{/snippet}

<Ledger
	{rows}
	{columns}
	{layout}
	{fyStart}
	{onAttachment}
	title="Transactions"
	bind:preferences={prefs}
	onPreferencesChange={(next) => emitted.push(next)}
	bind:selected
	bind:open
	bulkActions={withBulk ? bulk : undefined}
	editor={withEditor ? edit : undefined}
	originActions={undo}
/>
<output data-probe="emitted">{JSON.stringify(emitted.at(-1) ?? null)}</output>
<output data-probe="selected">{selected.join(',')}</output>
<output data-probe="open">{open ?? ''}</output>
<output data-probe="acted">{acted}</output>
