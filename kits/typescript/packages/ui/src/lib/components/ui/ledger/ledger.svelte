<script lang="ts" generics="R extends LedgerRow">
	/**
	 * The household ledger: one component for every money list, read the same
	 * way in every module. The consumer brings its rows and the columns it
	 * offers; the ledger owns the look (PocketSmith's: a head card, one card per
	 * period, the group's label on the page ground), the grouping and the
	 * viewer's toggles, which it emits for the consumer to keep.
	 *
	 * It fills its parent's height and scrolls its own rows, so the head card
	 * stays at the top: give it a bounded parent (`flex-1 min-h-0` in a
	 * full-height page). Width picks the layout: a phone's list below 600px, the
	 * wide column widths from 1200px.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { SvelteSet } from 'svelte/reactivity';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import X from '@lucide/svelte/icons/x';
	import Button from '../button/button.svelte';
	import { Checkbox } from '../checkbox/index.js';
	import EmptyState from '../empty-state/empty-state.svelte';
	import LedgerColumns from './ledger-columns.svelte';
	import { cn } from '$lib/utils.js';
	import { cents, fySpan, groupRows, ledgerDate, ledgerMoney, periodLabel } from './ledger.js';
	import type { LedgerColumn, LedgerOpenContext, LedgerPreferences, LedgerRow } from './types.js';

	type Id = R['id'];

	let {
		rows,
		columns = [],
		preferences = $bindable(),
		onPreferencesChange,
		preferencesNote,
		fyStart = 7,
		currency = 'AUD',
		noun = ['transaction', 'transactions'],
		title,
		meta,
		actions,
		selected = $bindable([]),
		bulkActions,
		open = $bindable(null),
		onOpenChange,
		editor,
		originActions,
		onAttachment,
		empty,
		footer,
		layout = 'auto',
		class: className,
		...restProps
	}: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
		rows: readonly R[];
		/** The module's columns, in order after the amount. See `LedgerColumn`. */
		columns?: LedgerColumn<R>[];
		/** The viewer's columns and period. Missing fields take the module's defaults. */
		preferences?: Partial<LedgerPreferences>;
		onPreferencesChange?: (next: LedgerPreferences) => void;
		/** The Columns menu's footnote: where the choice is kept. */
		preferencesNote?: string;
		/** The month a financial year starts, 1–12. July by default. */
		fyStart?: number;
		currency?: string;
		/** What a row is called, one and many: a printed layer's "line". */
		noun?: [string, string];
		title?: string;
		/** Beside the title. Defaults to the row count. */
		meta?: string;
		/** The toolbar's own actions, after the Columns menu: export, add. */
		actions?: Snippet;
		/** The ticked rows' ids. Ticking needs `bulkActions`. */
		selected?: Id[];
		/** What the ticked rows allow, in the bar that replaces the toolbar. */
		bulkActions?: Snippet<[R[]]>;
		/** The row opened in place. Opening needs `editor`. */
		open?: Id | null;
		onOpenChange?: (id: Id | null) => void;
		/** The opened row's content. */
		editor?: Snippet<[R, LedgerOpenContext]>;
		/** Under a synthetic row's statement lines: split, join, undo. */
		originActions?: Snippet<[R]>;
		/** Makes the paperclip a button. */
		onAttachment?: (row: R) => void;
		empty?: Snippet;
		/** After the last group, inside the scroll: "Show more". */
		footer?: Snippet;
		layout?: 'auto' | 'phone' | 'narrow' | 'wide';
		class?: string;
	} = $props();

	const BUILT_IN: Record<string, Omit<LedgerColumn<R>, 'key'>> = {
		date: { label: 'Date', width: { narrow: '4.25rem', wide: '7rem' } },
		title: { label: 'Payee', width: { narrow: 'minmax(0, 1fr)', wide: 'minmax(16rem, 1.5fr)' } },
		amount: { label: 'Amount', width: { narrow: '7.25rem', wide: '9.5rem' }, align: 'end' },
		balance: {
			label: 'Running balance',
			head: 'Balance',
			width: { narrow: '7.5rem', wide: '10rem' },
			align: 'end',
			on: false
		}
	};
	const GUTTER = '2.5rem';
	const CELL = 'min-w-0 truncate px-2';
	const END = 'pr-5 text-right';
	/** The row's height rides the package's density ramp: 3.5rem, 3rem compact. */
	const ROW_HEIGHT = 'min-height: calc(var(--ds-control-height-md) + 1rem);';

	// ── Columns: the ledger's own three, the module's, the balance last ──
	const resolved = $derived.by(() => {
		const own = (key: string) => columns.find((c) => c.key === key);
		const fixed = ['date', 'title', 'amount'].map((key) => ({
			...BUILT_IN[key],
			...own(key),
			key,
			locked: true
		}));
		const module = columns
			.filter((c) => !(c.key in BUILT_IN))
			.map((c) => ({ ...c, locked: false }));
		const balance = own('balance')
			? [{ ...BUILT_IN.balance, ...own('balance'), key: 'balance', locked: false }]
			: [];
		return [...fixed, ...module, ...balance].map((c) => ({
			...c,
			on: c.on ?? true,
			track:
				typeof c.width === 'string'
					? { narrow: c.width, wide: c.width }
					: (c.width ?? { narrow: '6rem', wide: 'minmax(8rem, 1fr)' })
		}));
	});

	const defaults = $derived<LedgerPreferences>({
		columns: resolved.filter((c) => !c.locked && c.on).map((c) => c.key),
		period: 'month'
	});
	const prefs = $derived<LedgerPreferences>({ ...defaults, ...preferences });

	function setPreferences(next: LedgerPreferences) {
		preferences = next;
		onPreferencesChange?.(next);
	}

	// ── Layout ──
	let width = $state(0);
	const mode = $derived(
		layout !== 'auto'
			? layout
			: width === 0
				? 'narrow'
				: width < 600
					? 'phone'
					: width >= 1200
						? 'wide'
						: 'narrow'
	);
	const WIDE = $derived(mode === 'wide');
	const PHONE = $derived(mode === 'phone');
	const BY_DAY = $derived(prefs.period === 'day');

	const shown = $derived(
		resolved.filter(
			(c) => (c.locked || prefs.columns.includes(c.key)) && !(c.key === 'date' && BY_DAY)
		)
	);
	const template = $derived(
		`${GUTTER} ${shown.map((c) => (WIDE ? c.track.wide : c.track.narrow)).join(' ')}`
	);
	/** A column's grid line, the gutter being 1; 0 when it is not shown. */
	const column = (key: string) => {
		const i = shown.findIndex((c) => c.key === key);
		return i < 0 ? 0 : i + 2;
	};
	const cAmount = $derived(column('amount'));
	const afterAmount = $derived(shown.length + 1 - cAmount);
	const balanceColumn = $derived(resolved.find((c) => c.key === 'balance'));
	const balanceOn = $derived(!!balanceColumn && prefs.columns.includes('balance'));

	// ── Groups, newest first ──
	const groups = $derived(groupRows(rows, prefs.period, fyStart));
	/** Closed groups, keyed with their period so a new period starts open. */
	const closed = new SvelteSet<string>();
	const groupId = (key: string) => `${prefs.period}:${key}`;
	/** Synthetic rows opened to their statement lines. */
	const expanded = new SvelteSet<Id>();

	function toggle<T>(set: SvelteSet<T>, value: T) {
		if (set.has(value)) set.delete(value);
		else set.add(value);
	}

	// ── Selection and the opened row ──
	const selectable = $derived(!!bulkActions && !PHONE);
	const openable = $derived(!!editor);
	const ticked = $derived(new Set<Id>(selected));
	const tickedRows = $derived(groups.flatMap((g) => g.rows).filter((r) => ticked.has(r.id)));
	const inView = $derived(groups.filter((g) => !closed.has(groupId(g.key))).flatMap((g) => g.rows));
	const allTicked = $derived(inView.length > 0 && inView.every((r) => ticked.has(r.id)));
	const someTicked = $derived(!allTicked && inView.some((r) => ticked.has(r.id)));

	// Reassigned rather than mutated: these are the consumer's bound values.
	function tick(ids: Id[], on: boolean) {
		selected = on
			? [...selected, ...ids.filter((id) => !ticked.has(id))]
			: selected.filter((id) => !ids.includes(id));
		if (on) setOpen(null);
	}

	function setOpen(id: Id | null) {
		if (open === id) return;
		open = id;
		if (id !== null) selected = [];
		onOpenChange?.(id);
	}

	const context: LedgerOpenContext = {
		close: () => setOpen(null),
		get template() {
			return template;
		},
		column
	};

	/** A group's rows in runs, split where a row is open: it lifts out of the card. */
	function runs(rs: R[]): ({ open: R } | { rows: R[] })[] {
		const out: ({ open: R } | { rows: R[] })[] = [];
		for (const r of rs) {
			const last = out[out.length - 1];
			if (openable && r.id === open) out.push({ open: r });
			else if (last && 'rows' in last) last.rows.push(r);
			else out.push({ rows: [r] });
		}
		return out;
	}

	function totals(rs: R[]) {
		let inn = 0;
		let out = 0;
		for (const r of rs) {
			const c = cents(r.amount);
			if (c > 0) inn += c;
			else out += c;
		}
		return { net: (inn + out) / 100, inn: inn / 100, out: out / 100 };
	}

	const money = (value: number | string) => ledgerMoney(value, currency);
	const count = (n: number) => `${n.toLocaleString('en-AU')} ${n === 1 ? noun[0] : noun[1]}`;
	const income = (value: number | string | null | undefined) => cents(value) > 0;
	const reviewOf = (r: R) => (r.review === true ? 'warning' : r.review || null);
	const balanceText = (r: R) =>
		balanceColumn?.text ? balanceColumn.text(r) : r.balance == null ? '' : money(r.balance);
</script>

{#snippet clip(r: R)}
	{#if onAttachment}
		<button
			type="button"
			class="text-muted-foreground hover:text-foreground focus-visible:ring-ring pointer-events-auto -m-0.5 grid size-5 flex-none place-items-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
			title={r.attachment}
			aria-label="Open {r.attachment}"
			onclick={() => onAttachment(r)}
			data-slot="ledger-attachment"
		>
			<Paperclip class="size-3.5" />
		</button>
	{:else}
		<span
			class="text-muted-foreground pointer-events-auto grid flex-none place-items-center"
			title={r.attachment}
			role="img"
			aria-label="Attached: {r.attachment}"
			data-slot="ledger-attachment"
		>
			<Paperclip class="size-3.5" />
		</span>
	{/if}
{/snippet}

{#snippet badge(r: R)}
	{@const on = expanded.has(r.id)}
	<button
		type="button"
		class={cn(
			'text-2xs pointer-events-auto inline-flex h-4.5 flex-none items-center gap-1 rounded-sm border pr-1 pl-1.5 font-medium whitespace-nowrap',
			on
				? 'border-border-strong bg-surface-3 text-foreground'
				: 'border-border bg-surface-1 text-muted-foreground'
		)}
		aria-expanded={on}
		title={on ? 'Hide the statement lines it is made of' : 'Show the statement lines it is made of'}
		onclick={() => toggle(expanded, r.id)}
		data-slot="ledger-not-printed"
	>
		Not as printed<ChevronDown class={cn('size-2.5 transition-transform', on && 'rotate-180')} />
	</button>
{/snippet}

{#snippet dot(r: R, beside: boolean)}
	{@const status = reviewOf(r)}
	{#if status}
		<span
			class={cn(
				'ds-dot size-1.5',
				`ds-dot-${status}`,
				beside && 'absolute top-1/2 right-[calc(50%+0.75rem)] -translate-y-1/2'
			)}
			role="img"
			aria-label="Needs review"
			data-slot="ledger-review"
		></span>
	{/if}
{/snippet}

{#snippet cells(r: R)}
	{#each shown as c, i (c.key)}
		{@const style = `grid-column: ${i + 2}; grid-row: 1;`}
		{@const through = openable && 'pointer-events-none'}
		{#if c.key === 'date'}
			<span class={cn(CELL, through, 'text-muted-foreground self-center tabular-nums')} {style}>
				{ledgerDate(r.date, WIDE)}
			</span>
		{:else if c.key === 'title'}
			<span
				class={cn(
					through,
					'flex min-w-0 flex-col justify-center gap-0.5 self-center px-2 font-medium'
				)}
				{style}
				data-slot="ledger-title"
			>
				<span class="flex min-w-0 items-center gap-1.5">
					<span class="min-w-0 truncate">{r.title}</span>
					{#if r.attachment}{@render clip(r)}{/if}
				</span>
				{#if r.note || r.origins}
					<span class="text-muted-foreground flex min-w-0 items-center gap-2 text-xs font-normal">
						{#if r.origins}{@render badge(r)}{/if}
						{#if r.note}<span class="min-w-0 truncate">{r.note}</span>{/if}
					</span>
				{/if}
			</span>
		{:else if c.key === 'amount'}
			<span
				class={cn(
					CELL,
					END,
					through,
					'self-center tabular-nums',
					income(r.amount) && 'text-status-success'
				)}
				{style}
				data-slot="ledger-amount"
			>
				{money(r.amount)}
			</span>
		{:else if c.key === 'balance'}
			<span class={cn(CELL, END, through, 'self-center tabular-nums')} {style}
				>{balanceText(r)}</span
			>
		{:else if c.cell}
			<span class={cn(CELL, through, 'flex items-center self-center')} {style}
				>{@render c.cell(r)}</span
			>
		{:else}
			<span class={cn(CELL, through, 'self-center', c.align === 'end' && END)} {style}>
				{c.text?.(r) ?? ''}
			</span>
		{/if}
	{/each}
{/snippet}

{#snippet origins(r: R)}
	{@const og = r.origins}
	{#if og && expanded.has(r.id)}
		<div
			class="bg-surface-1/60 border-border/60 flex flex-col border-t pb-2"
			role="list"
			aria-label="The statement lines it is made of"
			data-slot="ledger-origins"
		>
			{#each og.lines as l, i (i)}
				{#if PHONE}
					<div role="listitem" class="flex items-center gap-3 px-3 py-1.5 text-xs">
						<span class="text-muted-foreground tabular-nums">{ledgerDate(l.date, false)}</span>
						<span class="flex min-w-0 flex-1 flex-col">
							<span class="truncate">{l.description}</span>
							{#if l.source}<span class="text-muted-foreground text-2xs truncate">{l.source}</span
								>{/if}
						</span>
						<span
							class={cn(
								'tabular-nums',
								income(l.amount) ? 'text-status-success' : 'text-muted-foreground'
							)}
						>
							{money(l.amount)}
						</span>
					</div>
				{:else}
					<div role="listitem" class="grid min-h-10 text-xs" style:grid-template-columns={template}>
						{#if column('date')}
							<span
								class={cn(CELL, 'text-muted-foreground self-center tabular-nums')}
								style="grid-column: {column('date')};"
							>
								{ledgerDate(l.date, WIDE)}
							</span>
						{/if}
						<span
							class="border-border-strong ml-4.5 flex min-w-0 flex-col justify-center gap-px border-l-2 py-1.5 pr-2 pl-2.5"
							style="grid-column: {column('title')} / {cAmount};"
						>
							<span class="truncate" title={l.description}>{l.description}</span>
							{#if l.source}<span class="text-muted-foreground text-2xs truncate">{l.source}</span
								>{/if}
						</span>
						<span
							class={cn(
								CELL,
								END,
								'self-center tabular-nums',
								income(l.amount) ? 'text-status-success' : 'text-muted-foreground'
							)}
							style="grid-column: {cAmount};"
						>
							{money(l.amount)}
						</span>
					</div>
				{/if}
			{/each}
			{#if og.summary || originActions}
				<!-- Under the lines' own text: the indent, the rule and its padding. -->
				<div class="grid pt-1.5" style:grid-template-columns={PHONE ? '1fr' : template}>
					<div
						class={cn(
							'flex min-w-0 items-center gap-2 pr-3',
							PHONE ? 'pl-3' : 'pl-[calc(1.75rem+2px)]'
						)}
						style:grid-column={PHONE ? undefined : `${column('title')} / -1`}
					>
						<span class="text-muted-foreground min-w-0 flex-1 truncate text-xs"
							>{og.summary ?? ''}</span
						>
						{#if originActions}{@render originActions(r)}{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet row(r: R, first: boolean)}
	{@const on = ticked.has(r.id)}
	{@const label = `${r.title}, ${ledgerDate(r.date)}, ${money(r.amount)}`}
	{#if PHONE}
		{@const two = [BY_DAY ? '' : ledgerDate(r.date, false), r.note ?? '']
			.filter(Boolean)
			.join(' · ')}
		<div
			class={cn(
				'relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 text-sm',
				!first && 'border-border/60 border-t',
				openable && 'hover:bg-accent/40'
			)}
			style={ROW_HEIGHT}
			data-slot="ledger-row"
		>
			{#if openable}
				<button
					type="button"
					class="absolute inset-0 cursor-pointer"
					aria-label="Open {label}"
					onclick={() => setOpen(r.id)}
				></button>
			{/if}
			<span class="pointer-events-none flex min-w-0 flex-col justify-center gap-0.5">
				<span class="flex min-w-0 items-center gap-1.5">
					{@render dot(r, false)}
					<span class="min-w-0 truncate font-medium">{r.title}</span>
					{#if r.attachment}{@render clip(r)}{/if}
				</span>
				{#if two || r.origins}
					<span class="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
						{#if r.origins}{@render badge(r)}{/if}
						<span class="min-w-0 truncate">{two}</span>
					</span>
				{/if}
			</span>
			<span class="pointer-events-none flex flex-col items-end justify-center gap-0.5 tabular-nums">
				<span class={cn(income(r.amount) && 'text-status-success')} data-slot="ledger-amount"
					>{money(r.amount)}</span
				>
				{#if balanceOn && balanceText(r)}<span class="text-muted-foreground text-xs"
						>{balanceText(r)}</span
					>{/if}
			</span>
		</div>
	{:else}
		<div
			class={cn(
				'relative grid items-stretch text-[0.8125rem]',
				!first && 'border-border/60 border-t',
				on && 'bg-primary/9',
				openable && !on && 'hover:bg-accent/40'
			)}
			style="grid-template-columns: {template}; {ROW_HEIGHT}"
			data-slot="ledger-row"
		>
			<span class="relative flex items-center justify-center" style="grid-column: 1; grid-row: 1;">
				{@render dot(r, selectable)}
				{#if selectable}
					<Checkbox
						checked={on}
						aria-label="Select {label}"
						onCheckedChange={(v) => tick([r.id], v === true)}
					/>
				{/if}
			</span>
			{#if openable}
				<button
					type="button"
					class="cursor-pointer"
					style="grid-column: 2 / -1; grid-row: 1;"
					aria-label="Open {label}"
					onclick={() => setOpen(r.id)}
				></button>
			{/if}
			{@render cells(r)}
		</div>
	{/if}
	{@render origins(r)}
{/snippet}

{#snippet groupHead(key: string, rs: R[], gi: number)}
	{@const isOpen = !closed.has(groupId(key))}
	{@const t = totals(rs)}
	{@const single = BY_DAY && rs.length === 1}
	{@const label = periodLabel(
		key,
		prefs.period,
		fyStart,
		!(mode === 'narrow' && (BY_DAY || prefs.period === 'week'))
	)}
	{@const span = WIDE && prefs.period === 'fy' ? `${fySpan(key, fyStart)} · ` : ''}
	{@const metaText = single
		? ''
		: PHONE
			? rs.length.toLocaleString('en-AU')
			: span + count(rs.length)}
	{@const net = single ? '' : money(t.net)}
	{@const netTone = t.net > 0 ? 'text-status-success' : 'text-muted-foreground'}
	{@const klass = cn(
		'text-muted-foreground mb-1.5 h-6.5 w-full text-left text-xs',
		gi > 0 && 'mt-4.5',
		PHONE ? 'flex items-center gap-2 px-0.5' : 'grid items-center px-px'
	)}
	<!-- A day heads its rows and does not close; any other period's label opens and closes it. -->
	{#if BY_DAY}
		<div
			class={klass}
			style:grid-template-columns={PHONE ? undefined : template}
			data-slot="ledger-group"
		>
			{@render groupInner(label, metaText, net, netTone, t, single, isOpen)}
		</div>
	{:else}
		<button
			type="button"
			class={cn(klass, 'cursor-pointer')}
			aria-expanded={isOpen}
			onclick={() => toggle(closed, groupId(key))}
			style:grid-template-columns={PHONE ? undefined : template}
			data-slot="ledger-group"
		>
			{@render groupInner(label, metaText, net, netTone, t, single, isOpen)}
		</button>
	{/if}
{/snippet}

{#snippet groupInner(
	label: string,
	metaText: string,
	net: string,
	netTone: string,
	t: { inn: number; out: number },
	single: boolean,
	isOpen: boolean
)}
	{#if PHONE}
		{#if !BY_DAY}<ChevronRight
				class={cn('size-3.5 flex-none transition-transform', isOpen && 'rotate-90')}
			/>{/if}
		<span class="text-[0.8125rem] font-semibold whitespace-nowrap">{label}</span>
		<span class="min-w-0 flex-1 truncate">{metaText}</span>
		<span class={cn('tabular-nums', netTone)}>{net}</span>
	{:else}
		<span class="grid place-items-center" style="grid-column: 1;">
			{#if !BY_DAY}<ChevronRight
					class={cn('size-3.5 transition-transform', isOpen && 'rotate-90')}
				/>{/if}
		</span>
		<span
			class="flex min-w-0 items-baseline gap-3 overflow-hidden px-2 whitespace-nowrap"
			style="grid-column: 2 / {cAmount};"
		>
			<span class="text-[0.8125rem] font-semibold">{label}</span>
			<span class="min-w-0 truncate">{metaText}</span>
		</span>
		<span class={cn(CELL, END, 'tabular-nums', netTone)} style="grid-column: {cAmount};">{net}</span
		>
		{#if WIDE && afterAmount > 0 && !single}
			<span class={CELL} style="grid-column: {cAmount + 1} / -1;">
				In {money(t.inn)} · out {money(t.out)}
			</span>
		{/if}
	{/if}
{/snippet}

{#snippet card(rs: R[])}
	{#each runs(rs) as run, i (i)}
		{#if 'open' in run}
			<div
				class="bg-popover border-border-strong my-2 rounded-lg border shadow-md"
				data-slot="ledger-open"
			>
				{@render editor?.(run.open, context)}
			</div>
		{:else}
			<div class="bg-card border-border overflow-hidden rounded-lg border" data-slot="ledger-card">
				{#each run.rows as r, j (r.id)}
					{@render row(r, j === 0)}
				{/each}
			</div>
		{/if}
	{/each}
{/snippet}

<div
	bind:clientWidth={width}
	class={cn('relative flex min-h-0 flex-1 flex-col', className)}
	data-slot="ledger"
	data-layout={mode}
	{...restProps}
>
	{#if selectable && tickedRows.length}
		<div
			role="toolbar"
			aria-label="Act on the ticked rows"
			class="bg-card border-border-strong mx-2 mb-2.5 flex h-11 flex-none items-center gap-2 rounded-lg border pr-3 pl-1"
			style="background: color-mix(in oklch, var(--color-primary) 9%, var(--color-card));"
			data-slot="ledger-bulk"
		>
			<span class="grid size-8 place-items-center">
				<Checkbox checked aria-label="Clear the ticks" onCheckedChange={() => (selected = [])} />
			</span>
			<span class="text-sm font-semibold whitespace-nowrap"
				>{tickedRows.length.toLocaleString('en-AU')} ticked</span
			>
			<span class="text-muted-foreground mr-2 text-xs whitespace-nowrap tabular-nums">
				net {money(tickedRows.reduce((s, r) => s + cents(r.amount), 0) / 100)}
			</span>
			{@render bulkActions?.(tickedRows)}
			<span class="flex-1"></span>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Clear the ticks"
				onclick={() => (selected = [])}
			>
				<X />
			</Button>
		</div>
	{:else}
		<div
			role="toolbar"
			aria-label="This ledger"
			class="flex min-h-11 flex-none items-center gap-2 px-2 pb-2"
			data-slot="ledger-toolbar"
		>
			<span class="flex min-w-0 items-baseline gap-2.5 overflow-hidden whitespace-nowrap">
				{#if title}<span class="text-body flex-none font-semibold">{title}</span>{/if}
				<span class="text-muted-foreground truncate text-sm">{meta ?? count(rows.length)}</span>
			</span>
			<span class="min-w-0 flex-1"></span>
			<LedgerColumns
				offered={resolved.map((c) => ({ key: c.key, label: c.label, locked: c.locked }))}
				preferences={prefs}
				note={preferencesNote}
				onchange={setPreferences}
				onreset={() => setPreferences(defaults)}
			/>
			{@render actions?.()}
		</div>
	{/if}

	<div
		class="relative min-h-0 flex-1 overflow-auto px-2 pb-3 [scrollbar-width:thin]"
		style="scrollbar-gutter: stable;"
		data-slot="ledger-rows"
	>
		{#if !PHONE}
			<div class="bg-background sticky top-0 z-3 pb-3">
				<div
					class="bg-card border-border grid h-9 items-center rounded-lg border"
					style:grid-template-columns={template}
					data-slot="ledger-head"
				>
					<span class="grid place-items-center">
						{#if selectable}
							<Checkbox
								checked={allTicked}
								indeterminate={someTicked}
								aria-label="Select every {noun[0]} shown"
								onCheckedChange={(v) =>
									tick(
										inView.map((r) => r.id),
										v === true
									)}
							/>
						{/if}
					</span>
					{#each shown as c (c.key)}
						<span
							class={cn(
								CELL,
								'text-muted-foreground text-2xs tracking-eyebrow font-semibold uppercase',
								c.align === 'end' && END
							)}
						>
							{c.head ?? c.label}
						</span>
					{/each}
				</div>
			</div>
		{/if}

		{#if rows.length === 0}
			{#if empty}{@render empty()}{:else}<EmptyState title="No {noun[1]}" />{/if}
		{:else if prefs.period === 'none'}
			{@render card(groups[0]?.rows ?? [])}
		{:else}
			{#each groups as g, gi (g.key)}
				{@render groupHead(g.key, g.rows, gi)}
				{#if !closed.has(groupId(g.key))}
					{@render card(g.rows)}
				{/if}
			{/each}
		{/if}
		{@render footer?.()}
	</div>
</div>
