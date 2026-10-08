<script lang="ts">
	/**
	 * `?surface=records` and `?surface=record`: a module's list pages and a
	 * record's page, drawn with the shipped RecordList, ListToolbar,
	 * RecordSwitcher, ContextColumn and DocumentPane (radar-hooves/godswood's
	 * property module boards, 08/10/2026). The data is invented: this repo is
	 * public. `?list=` picks the list page (properties, managers, pnl, tools);
	 * `?doc=1` opens the record page on a document; `?switcher=1` opens the
	 * switcher's menu.
	 */
	import AppShell from '../dist/components/ui/app-shell/app-shell.svelte';
	import ShellControls from '../dist/components/ui/app-shell/shell-controls.svelte';
	import type { NavSource } from '../dist/components/ui/app-shell/types.js';
	import ContextColumn from '../dist/components/ui/context-column/context-column.svelte';
	import DocumentPane from '../dist/components/ui/document-pane/document-pane.svelte';
	import RecordList from '../dist/components/ui/record-list/record-list.svelte';
	import type { RecordListColumn, RecordListRow } from '../dist/components/ui/record-list/index.js';
	import RecordSwitcher from '../dist/components/ui/record-switcher/record-switcher.svelte';
	import type { RecordSwitcherGroup } from '../dist/components/ui/record-switcher/index.js';
	import { Segmented } from '../dist/components/ui/segmented/index.js';
	import Button from '../dist/components/ui/button/button.svelte';
	import StatusBadge from '../dist/components/ui/status-badge/status-badge.svelte';
	import Panel from '../dist/components/ui/panel/panel.svelte';
	import FactGrid from '../dist/components/ui/fact-grid/fact-grid.svelte';
	import Home from '@lucide/svelte/icons/house';
	import Landmark from '@lucide/svelte/icons/landmark';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Shield from '@lucide/svelte/icons/shield';
	import User from '@lucide/svelte/icons/user';
	import Receipt from '@lucide/svelte/icons/receipt';
	import Wrench from '@lucide/svelte/icons/wrench';
	import FileText from '@lucide/svelte/icons/file-text';
	import Download from '@lucide/svelte/icons/download';
	import Plus from '@lucide/svelte/icons/plus';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let { surface, params }: { surface: 'records' | 'record'; params: URLSearchParams } = $props();

	// ── Invented pictures: a photo-like tile and an A4 page ──
	const svg = (body: string, w: number, h: number) =>
		`data:image/svg+xml;charset=utf-8,${encodeURIComponent(
			`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
		)}`;
	const photo = (sky: string, wall: string, roof: string) =>
		svg(
			`<rect width="320" height="240" fill="${sky}"/><rect y="170" width="320" height="70" fill="#7a8f5a"/>` +
				`<rect x="70" y="105" width="180" height="85" fill="${wall}"/><polygon points="55,110 160,45 265,110" fill="${roof}"/>` +
				`<rect x="145" y="140" width="30" height="50" fill="#5b4636"/><rect x="90" y="125" width="34" height="26" fill="#cfe3f0"/>` +
				`<rect x="196" y="125" width="34" height="26" fill="#cfe3f0"/>`,
			320,
			240
		);
	const page = (n: number) =>
		svg(
			`<rect width="595" height="842" fill="#fff"/><rect x="200" y="60" width="195" height="12" rx="3" fill="#c9c9c9"/>` +
				`<text x="297" y="120" font-family="sans-serif" font-size="14" font-weight="700" text-anchor="middle" fill="#333">RESIDENTIAL TENANCY AGREEMENT</text>` +
				`<text x="297" y="142" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#666">Page ${n} of 3 · invented for the harness</text>` +
				Array.from(
					{ length: 26 },
					(_, i) =>
						`<rect x="${70 + (i % 3) * 8}" y="${190 + i * 22}" width="${440 - (i % 4) * 30}" height="7" rx="3" fill="#dcdcdc"/>`
				).join(''),
			595,
			842
		);
	const PHOTO_A = photo('#bcd4e6', '#e8dcc8', '#8a5a44');
	const PHOTO_B = photo('#d6e4ec', '#d9d4c7', '#5f6b73');
	const PHOTO_C = photo('#c9dbe8', '#efe6d6', '#9b6a4f');
	const PAGES = [page(1), page(2), page(3)];

	const nav: NavSource = [
		{ label: 'Home', href: '#/home', icon: Home },
		{
			label: 'Property',
			href: '#/property',
			icon: Home,
			children: [
				{ label: 'P&L', href: '#/property/pnl', icon: Receipt },
				{ label: 'Property managers', href: '#/property/managers', icon: User },
				{ label: 'Tools', href: '#/property/tools', icon: Wrench }
			]
		},
		{ label: 'Matters', href: '#/matters', icon: FileText }
	];

	// ── The module's first page: one line a property ──
	type Property = RecordListRow & {
		heldBy: string;
		value: number;
		loan: number;
		rent: number | null;
		leaseEnds: string;
		insuredTo: string;
		manager: string;
		net: number;
		matters: number;
	};
	const aud = (n: number) =>
		n < 0 ? `($${Math.abs(n).toLocaleString('en-AU')})` : `$${n.toLocaleString('en-AU')}`;
	const properties: Property[] = [
		{
			id: 3,
			title: '3. Ashgrove',
			note: '14 Ashgrove Street, Kenmore',
			image: PHOTO_A,
			heldBy: 'Owner A 40% · Owner B 60%',
			value: 812000,
			loan: 402500,
			rent: 940,
			leaseEnds: 'House, 21 Jan',
			insuredTo: '02 Feb 2027',
			manager: 'Northside Property Co.',
			net: 7412,
			matters: 4
		},
		{
			id: 4,
			title: '4. Banksia',
			note: null,
			image: PHOTO_B,
			flags: [
				{ status: 'warning', label: 'No insurance since 12 Mar' },
				{ status: 'warning', label: 'No lease on the house' }
			],
			heldBy: 'Owner A 50% · Owner B 50%',
			value: 575000,
			loan: 318750,
			rent: 515,
			leaseEnds: '2B, 30 Jun',
			insuredTo: 'None on file',
			manager: 'Riverbend Realty',
			net: 3105,
			matters: 2
		},
		{
			id: 5,
			title: '5. Coolabah',
			note: null,
			flags: [{ status: 'warning', label: 'No lease on file' }],
			heldBy: 'Family Trust 100%',
			value: 698000,
			loan: 255100,
			rent: null,
			leaseEnds: 'None on file',
			insuredTo: '19 Oct 2026',
			manager: 'Harbour Lane Real Estate',
			net: -1236,
			matters: 0
		}
	];
	const propertyColumns: RecordListColumn<Property>[] = [
		{ key: 'title', label: 'Property', width: { narrow: 'minmax(0, 1fr)', wide: 'minmax(18rem, 1.6fr)' } },
		{ key: 'heldBy', label: 'Held by', text: (r) => r.heldBy, on: 'wide' },
		{ key: 'value', label: 'Value', align: 'end', sort: (r) => r.value, text: (r) => aud(r.value) },
		{ key: 'loan', label: 'Loan', align: 'end', on: 'wide', sort: (r) => r.loan, text: (r) => aud(r.loan) },
		{
			key: 'lvr',
			label: 'LVR',
			align: 'end',
			width: { narrow: '4.5rem', wide: '5.5rem' },
			sort: (r) => r.loan / r.value,
			text: (r) => `${((r.loan / r.value) * 100).toFixed(1)}%`
		},
		{
			key: 'rent',
			label: 'Rent a week',
			head: 'Rent / wk',
			width: '7rem',
			align: 'end',
			sort: (r) => r.rent,
			text: (r) => (r.rent === null ? 'None' : aud(r.rent))
		},
		{ key: 'leaseEnds', label: 'Lease ends', text: (r) => r.leaseEnds, on: 'wide' },
		{ key: 'insuredTo', label: 'Insured to', text: (r) => r.insuredTo, on: 'wide' },
		{ key: 'manager', label: 'Manager', text: (r) => r.manager, on: 'wide' },
		{ key: 'net', label: 'Net, FY 2026-27', align: 'end', on: 'wide', sort: (r) => r.net, text: (r) => aud(r.net) },
		{ key: 'matters', label: 'Matters', align: 'end', on: 'wide', width: '7rem', sort: (r) => r.matters, text: (r) => String(r.matters) }
	];

	// ── Property managers: grouped, a fee not on file in the warning ink ──
	type Manager = RecordListRow & { status: string; from: string; to: string; fee: string | null };
	const managers: Manager[] = [
		['Northside Property Co.', '3. Ashgrove; before it, 2. Dorrigo', 'Managing now', 'Apr 2025', 'Now', null],
		['Riverbend Realty', '4. Banksia', 'Managing now', 'Feb 2021', 'Now', '9%'],
		['Harbour Lane Real Estate', '5. Coolabah', 'Managing now', 'Oct 2023', 'Now', '8.5%'],
		['Bayview Agents', '3. Ashgrove and 2. Dorrigo', 'Before', 'Jun 2023', 'Apr 2025', null],
		['Coastline Property', '3. Ashgrove and 2. Dorrigo', 'Before', 'Jan 2021', 'Jun 2023', null],
		['Summit Realty Group', '1. Eumundi', 'Before', 'May 2018', 'Nov 2021', null],
		['Greenway Real Estate', '2. Dorrigo', 'Before', 'Mar 2019', 'Jan 2021', null],
		['Parkside Estate Agents', '1. Eumundi', 'Before', 'Feb 2015', 'May 2018', null],
		['Lakeview Property Partners', '', 'No property on record', '', '', null],
		['Westgate Realty', '', 'No property on record', '', '', null]
	].map(([title, note, status, from, to, fee], i) => ({
		id: i + 1,
		title: title!,
		note,
		status: status!,
		from: from!,
		to: to!,
		fee
	}));
	const managerColumns: RecordListColumn<Manager>[] = [
		{ key: 'title', label: 'Company' },
		{ key: 'from', label: 'From', text: (r) => r.from, width: '7rem' },
		{ key: 'to', label: 'To', text: (r) => r.to, width: '7rem' },
		{ key: 'fee', label: 'Fee', align: 'end', width: '7rem', cell: fee, sort: (r) => r.fee }
	];

	// ── The portfolio's P&L: one line a property, a total card ──
	type Line = RecordListRow & { income: number; deductions: number };
	const lines: Line[] = [
		{ id: 3, title: '3. Ashgrove', note: 'Owner A 40% · Owner B 60%', image: PHOTO_A, income: 44210.5, deductions: -31877.2 },
		{ id: 4, title: '4. Banksia', note: 'Owner A 50% · Owner B 50%', image: PHOTO_B, income: 30845, deductions: -27312.65 },
		{ id: 5, title: '5. Coolabah', note: 'Family Trust 100%', income: 18400, deductions: -21950.4 }
	];
	const cents = (n: number) =>
		(n < 0 ? '(' : '') +
		`$${Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` +
		(n < 0 ? ')' : '');
	const sum = (rs: readonly Line[], f: (r: Line) => number) => rs.reduce((s, r) => s + f(r), 0);
	const lineColumns: RecordListColumn<Line>[] = [
		{ key: 'title', label: 'Property' },
		{ key: 'income', label: 'Income', align: 'end', width: '8.5rem', cell: gain, sort: (r) => r.income, total: (rs) => cents(sum(rs, (r) => r.income)) },
		{ key: 'deductions', label: 'Deductions', align: 'end', width: '8.5rem', sort: (r) => r.deductions, text: (r) => cents(r.deductions), total: (rs) => cents(sum(rs, (r) => r.deductions)) },
		{ key: 'net', label: 'Net rental', align: 'end', width: '8.5rem', sort: (r) => r.income + r.deductions, text: (r) => cents(r.income + r.deductions), total: (rs) => cents(sum(rs, (r) => r.income + r.deductions)) }
	];
	let pnlView = $state('property');

	// ── Tools: no heads, a button a row ──
	type Tool = RecordListRow & { last: string; waiting: number; run: string };
	const tools: Tool[] = [
		{ id: 'split', title: 'Split loan repayments', note: 'Interest and principal, from the bank’s own statement lines', icon: Landmark, last: '03 Sep 2026', waiting: 1, run: 'Open' },
		{ id: 'value', title: 'Refresh valuations', note: 'Each owned property’s estimate, from the listing site', icon: RefreshCw, last: '21 Sep 2026', waiting: 0, run: 'Run' }
	];
	const toolColumns: RecordListColumn<Tool>[] = [
		{ key: 'title', label: 'Tool' },
		{ key: 'last', label: 'Last run', text: (r) => r.last, width: '8rem' },
		{ key: 'state', label: 'Waiting', align: 'end', width: '8rem', cell: waiting },
		{ key: 'run', label: 'Run', align: 'end', width: '6rem', cell: runButton }
	];
	let ran = $state('');

	const list = params.get('list') ?? 'properties';
	let opened = $state<string | number | null>(null);

	// ── A record's page: its sections, the opened one in the column, its document beside ──
	const switcherGroups: RecordSwitcherGroup[] = [
		{
			label: 'Owned',
			items: [
				{ id: 3, label: '3. Ashgrove', note: 'Kenmore · $812,000', href: '#/property/3', image: PHOTO_A },
				{ id: 4, label: '4. Banksia', note: 'Tarragindi · $575,000', href: '#/property/4', image: PHOTO_B },
				{ id: 5, label: '5. Coolabah', note: 'Bulimba · $698,000', href: '#/property/5' }
			]
		},
		{
			label: 'Sold',
			items: [
				{ id: 2, label: '2. Dorrigo', note: 'Ascot · sold Mar 2024', href: '#/property/2' },
				{ id: 1, label: '1. Eumundi', note: 'Mudgeeraba · sold Nov 2021', href: '#/property/1', image: PHOTO_C }
			]
		}
	];
	let switcherOpen = $state(params.get('switcher') === '1');

	type Section = RecordListRow & { summary: string; trailing: string };
	const sections: Section[] = [
		{ id: 'tenancy', title: 'Tenancy', icon: Home, summary: 'House: no lease since 18 Jan · 2B to 30 Jun', trailing: '', flags: [{ status: 'warning', label: 'Needs you' }] },
		{ id: 'insurance', title: 'Insurance', icon: Shield, summary: 'No policy on file since 12 Mar 2026', trailing: '', flags: [{ status: 'warning', label: 'Needs you' }] },
		{ id: 'loan', title: 'Loan', icon: Landmark, summary: 'The lender · $318,750 at 5.94%', trailing: '1 closed' },
		{ id: 'manager', title: 'Manager', icon: User, summary: 'Riverbend Realty · 9% · since Feb 2021', trailing: '' },
		{ id: 'documents', title: 'Documents', icon: FileText, summary: 'Latest: owner statement, 02 Sep 2026', trailing: '' }
	];
	const sectionColumns: RecordListColumn<Section>[] = [
		{ key: 'title', label: 'Section', width: '12rem' },
		{ key: 'summary', label: 'Summary', text: (r) => r.summary, width: 'minmax(0, 1fr)' },
		{ key: 'trailing', label: 'Note', align: 'end', width: '6.5rem', text: (r) => r.trailing }
	];
	let section = $state<string>(params.get('open') ?? 'tenancy');
	const opening = $derived(sections.find((s) => s.id === section)!);
	let lease = $state<string | null>(params.get('doc') === '1' ? 'House · 19 Jul 2025 to 18 Jan 2026' : null);
	const LEASES = [
		['House', '19 Jul 2025 to 18 Jan 2026', '$495/wk'],
		['2B', '01 Jul 2025 to 30 Jun 2026', '$380/wk · bond $1,520'],
		['2B', '01 Jul 2024 to 30 Jun 2025', '$365/wk · bond $1,460'],
		['House', 'From 03 Feb 2024, no end date', '$470/wk · bond $1,880'],
		['House', '03 Aug 2023 to 02 Feb 2024', '$455/wk'],
		['2B', '15 Jun 2023 to 30 Jun 2024', '$350/wk · bond $1,400'],
		['House', '03 Feb 2023 to 02 Aug 2023', '$440/wk · bond $1,760'],
		['House', '12 Jul 2022 to 02 Feb 2023', '$425/wk · bond $1,700']
	];
	const eyebrow = 'text-muted-foreground text-2xs tracking-eyebrow font-semibold uppercase';
</script>

{#snippet fee(r: Manager)}
	{#if r.status === 'Managing now' && !r.fee}
		<span class="text-status-warning">Not on file</span>
	{:else}{r.fee ?? ''}{/if}
{/snippet}

{#snippet gain(r: Line)}
	<span class="text-status-success">{cents(r.income)}</span>
{/snippet}

{#snippet waiting(r: Tool)}
	{#if r.waiting}<StatusBadge status="warning" label="{r.waiting} waiting" />{:else}<span
			class="text-muted-foreground">3 properties</span
		>{/if}
{/snippet}

{#snippet runButton(r: Tool)}
	<Button variant="outline" size="sm" onclick={() => (ran = String(r.id))} data-probe="tool-run">{r.run}</Button>
{/snippet}

{#snippet pnlSwitch()}
	<Segmented
		bind:value={pnlView}
		options={[
			{ value: 'property', label: 'By property' },
			{ value: 'category', label: 'By category' }
		]}
		label="Profit and loss by"
		size="sm"
		class="mr-3"
	/>
{/snippet}

{#snippet leaseDoc()}
	<DocumentPane
		title="Residential tenancy agreement"
		subtitle={lease ?? ''}
		pages={PAGES}
		actions={[{ label: 'Download', icon: Download, href: PAGES[0], download: 'lease.svg' }]}
		onClose={() => (lease = null)}
	/>
{/snippet}

{#if surface === 'records'}
	{@const here = list === 'managers' ? '#/property/managers' : list === 'pnl' ? '#/property/pnl' : list === 'tools' ? '#/property/tools' : '#/property'}
	<AppShell {nav} currentPath={here} brandTitle="Godswood" onSearch={() => {}} searchPlacement="trailing" texture="grid">
		<div class="flex min-h-0 flex-1 gap-5">
			<div class="flex min-h-0 min-w-0 flex-1 flex-col">
				{#if list === 'managers'}
					<RecordList
						rows={managers}
						columns={managerColumns}
						noun={['company', 'companies']}
						title="All managers"
						group={(r) => r.status}
						tools={[{ label: 'Download as CSV', icon: Download }]}
						action={{ label: 'Add manager', icon: Plus }}
						onOpen={(r) => (opened = r.id)}
						open={opened}
						data-probe="record-list"
					/>
				{:else if list === 'pnl'}
					<RecordList
						rows={lines}
						columns={lineColumns}
						noun={['property', 'properties']}
						title="Profit and loss"
						meta="before depreciation"
						leading={pnlSwitch}
						totalLabel="All three"
						icon={Home}
						tools={[{ label: 'Download as CSV', icon: Download }]}
						href={(r) => `#/property/${r.id}/pnl`}
						data-probe="record-list"
					/>
				{:else if list === 'tools'}
					<RecordList
						rows={tools}
						columns={toolColumns}
						noun={['tool', 'tools']}
						title="Tools"
						head={false}
						data-probe="record-list"
					/>
					<output class="hidden" data-probe="tool-ran">{ran}</output>
				{:else}
					<RecordList
						rows={properties}
						columns={propertyColumns}
						noun={['property', 'properties']}
						title="Owned properties"
						icon={Home}
						preferencesNote="Kept for you on this page"
						tools={[{ label: 'Download as CSV', icon: Download }]}
						action={{ label: 'Add property', icon: Plus }}
						href={(r) => `#/property/${r.id}`}
						data-probe="record-list"
					/>
				{/if}
			</div>
			<ContextColumn
				stats={[
					{ label: 'Value', value: '$2,085,000', sub: '3 properties' },
					{ label: 'Loans', value: '$976,350' },
					{ label: 'Equity', value: '$1,108,650' },
					{ label: 'Needs you', value: 2, status: 'warning', sub: 'properties' }
				]}
				statsInfo="The owned properties, today."
				ariaLabel="Property context"
			/>
		</div>
	</AppShell>
{:else}
	<AppShell {nav} currentPath="#/property/4" brandTitle="Godswood" location="Property" onSearch={() => {}} searchPlacement="trailing" texture="grid">
		<ShellControls>
			<RecordSwitcher
				name="4. Banksia"
				current={4}
				groups={switcherGroups}
				noun="property"
				icon={Home}
				all={{ label: 'All properties', href: '#/property' }}
				pages={[
					{ label: 'Overview', href: '#/property/4', current: true },
					{ label: 'Ledger', href: '#/property/4/ledger' },
					{ label: 'P&L', href: '#/property/4/pnl' },
					{ label: 'Documents', href: '#/property/4/documents' },
					{ label: 'Tenancy', href: '#/property/4/tenancy' }
				]}
				bind:open={switcherOpen}
			/>
		</ShellControls>
		<div class="flex min-h-0 flex-1 gap-5" data-probe="record-row">
			<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
				<Panel title="12 Banksia Place, Tarragindi" subtitle="House and granny flat 2B · held by Owner A 50% · Owner B 50%">
					<FactGrid
						facts={[
							{ key: 'value', label: 'Value', value: '$575,000' },
							{ key: 'loan', label: 'Loan', value: '$318,750' },
							{ key: 'equity', label: 'Equity', value: '$256,250' },
							{ key: 'lvr', label: 'LVR', value: '55.4%' },
							{ key: 'rent', label: 'Rent', value: '$515/wk' },
							{ key: 'to-review', label: 'To review', value: '12' }
						]}
					/>
				</Panel>
				<div class="flex min-h-0 flex-col">
					<RecordList
						rows={sections}
						columns={sectionColumns}
						head={false}
						onOpen={(r) => {
							section = String(r.id);
							lease = null;
						}}
						open={section}
						class="-mx-2 flex-none"
						data-probe="sections"
					/>
				</div>
			</div>
			<ContextColumn
				title={opening.title}
				subtitle={section === 'tenancy' ? 'Opened on what needs you' : undefined}
				onClose={() => {
					section = 'tenancy';
					lease = null;
				}}
				documentPane={lease ? leaseDoc : undefined}
			>
				{#if section === 'tenancy'}
					<div class="border-border flex flex-col gap-2.5 border-b px-4 py-3.5 text-sm">
						<span class={eyebrow}>House</span>
						<p class="flex gap-2">
							<TriangleAlert class="text-status-warning mt-0.5 size-4 flex-none" />
							No lease on file since 18 Jan 2026. The last ran from 19 Jul 2025 at $495/wk.
						</p>
						<Button size="sm" class="self-start">File the new lease</Button>
					</div>
					<div class="border-border flex items-center gap-2 border-b px-4 pt-3.5 pb-2">
						<span class={eyebrow}>Every lease</span>
						<span class="text-muted-foreground text-xs">{LEASES.length}, newest first</span>
					</div>
					{#each LEASES as [dwelling, span, terms], i (i)}
						{@const on = lease === `${dwelling} · ${span}`}
						<button
							type="button"
							class="border-border/60 hover:bg-accent/40 flex w-full items-center gap-4 border-b px-4 py-2.5 text-left text-sm last:border-0 {on
								? 'bg-accent/60'
								: ''}"
							onclick={() => (lease = `${dwelling} · ${span}`)}
							data-probe="lease"
						>
							<span class="w-10 flex-none text-xs font-semibold">{dwelling}</span>
							<span class="flex min-w-0 flex-1 flex-col">
								<span>{span}</span>
								<span class="text-muted-foreground text-xs">{terms}</span>
							</span>
							{#if on}<span class="text-primary text-xs">Open beside</span>{/if}
						</button>
					{/each}
				{:else}
					<div class="flex flex-col gap-2 px-4 py-3.5 text-sm" data-probe="opened-body">
						<span class={eyebrow}>{opening.title}</span>
						<p>{opening.summary}</p>
					</div>
				{/if}
			</ContextColumn>
		</div>
	</AppShell>
{/if}
