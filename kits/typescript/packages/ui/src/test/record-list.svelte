<script lang="ts">
	// Fixture for record-list.test.ts: a consumer's wiring, with a cell of its
	// own markup (a button) and probes for what the list emits.
	import RecordList from '$lib/components/ui/record-list';
	import type {
		RecordListColumn,
		RecordListPreferences,
		RecordListRow
	} from '$lib/components/ui/record-list';
	import House from '@lucide/svelte/icons/house';

	type Row = RecordListRow & { value: number; group?: string; fee?: string };

	let {
		rows,
		columns,
		layout = 'narrow',
		grouped = false,
		totalLabel,
		head = true,
		tile = false,
		linked = false,
		opening = false,
		withCell = false,
		figureCell = false,
		mutable = false,
		title = 'Owned properties'
	}: {
		rows: Row[];
		columns?: RecordListColumn<Row>[];
		layout?: 'phone' | 'narrow' | 'wide';
		grouped?: boolean;
		totalLabel?: string;
		head?: boolean;
		tile?: boolean;
		linked?: boolean;
		opening?: boolean;
		withCell?: boolean;
		figureCell?: boolean;
		mutable?: boolean;
		title?: string;
	} = $props();

	// svelte-ignore state_referenced_locally
	let live = $state(mutable ? rows : []);
	let prefs = $state<Partial<RecordListPreferences>>();
	let emitted = $state<RecordListPreferences[]>([]);
	let open = $state<Row['id'] | null>(null);
	let ran = $state('');

	const value = (n: number) => `$${n.toLocaleString('en-AU')}`;
	const DEFAULT: RecordListColumn<Row>[] = [
		{ key: 'title', label: 'Property' },
		{
			key: 'value',
			label: 'Value',
			align: 'end',
			sort: (r) => r.value,
			text: (r) => value(r.value),
			total: (rs) => value(rs.reduce((s, r) => s + r.value, 0))
		},
		{ key: 'loan', label: 'Loan', align: 'end', on: 'wide', text: (r) => value(r.value / 2) }
	];
</script>

{#snippet figure(r: Row)}
	<span data-probe="figure">{r.value}</span>
{/snippet}

{#snippet run(r: Row)}
	<button type="button" onclick={() => (ran = String(r.id))}>Run {r.title}</button>
{/snippet}

<RecordList
	rows={mutable ? live : rows}
	columns={figureCell
		? [...DEFAULT, { key: 'figure', label: 'Figure', cell: figure }]
		: withCell
			? [...DEFAULT, { key: 'run', label: 'Run', cell: run }]
			: (columns ?? DEFAULT)}
	{layout}
	{head}
	{totalLabel}
	{title}
	noun={['property', 'properties']}
	group={grouped ? (r) => r.group ?? '' : undefined}
	icon={tile ? House : undefined}
	href={linked ? (r) => `/property/${r.id}` : undefined}
	onOpen={opening ? (r) => (open = r.id) : undefined}
	{open}
	bind:preferences={prefs}
	onPreferencesChange={(next) => emitted.push(next)}
/>
<button type="button" onclick={() => live.forEach((r) => r.value++)}>Bump</button>
<output data-probe="emitted">{JSON.stringify(emitted)}</output>
<output data-probe="ran">{ran}</output>
