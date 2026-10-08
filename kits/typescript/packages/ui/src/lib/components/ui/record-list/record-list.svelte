<script lang="ts" generics="R extends RecordListRow">
	/**
	 * The ledger's look for a list that is not money: properties, managers,
	 * tools, the lines of a profit and loss. The same bar, head card, row cards
	 * and group labels on the ground as the Ledger, so every list in an app
	 * reads one way. The consumer brings its rows and the columns it offers; the
	 * list owns the look, the grouping, the sort and the viewer's columns,
	 * which it emits for the consumer to keep.
	 *
	 * A row is its thumbnail, its title and a second line of flags and a note,
	 * then the module's columns. It opens by its link (`href`) or by `onOpen`,
	 * which marks the row `open` names, for a detail beside the list.
	 *
	 * It fills its parent's height and scrolls its own rows, so the head card
	 * stays at the top: give it a bounded parent (`flex-1 min-h-0`). Width picks
	 * the layout, as the Ledger's does: a phone's list below 480px, the wide
	 * tracks and the `'wide'` columns from 1200px. On a phone a row is its
	 * thumbnail, title and lines, with the first end-aligned column's value
	 * beside the title.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import EmptyState from '../empty-state/empty-state.svelte';
	import StatusBadge from '../status-badge/status-badge.svelte';
	import HeadCell from '../ledger/head-cell.svelte';
	import LedgerColumns from '../ledger/ledger-columns.svelte';
	import { orderBy } from '../ledger/ledger.js';
	import {
		CARD,
		CELL,
		END,
		GROUP,
		GROUP_LABEL,
		HEAD,
		HEAD_GROUND,
		RING_INSET,
		ROW_HEIGHT,
		ROW_TEXT,
		RULE,
		THROUGH,
		groupSpacing,
		listLayout
	} from '../ledger/look.js';
	import ListToolbar from '../list-toolbar/list-toolbar.svelte';
	import type { ListAction, ListIconAction } from '../list-toolbar/types.js';
	import type { IconComponent } from '../app-shell/types.js';
	import Thumbnail from './thumbnail.svelte';
	import { cn } from '$lib/utils.js';
	import type { RecordListColumn, RecordListPreferences, RecordListRow } from './types.js';

	type Id = R['id'];

	let {
		rows,
		columns = [],
		preferences = $bindable(),
		onPreferencesChange,
		preferencesNote,
		noun = ['record', 'records'],
		title,
		meta,
		leading,
		toolbar,
		tools = [],
		action,
		group,
		totalLabel,
		head = true,
		icon,
		href,
		onOpen,
		open = null,
		empty,
		footer,
		layout = 'auto',
		class: className,
		...restProps
	}: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
		rows: readonly R[];
		/** The module's columns, in order after the title. See `RecordListColumn`. */
		columns?: RecordListColumn<R>[];
		/** The viewer's columns. Missing, the module's defaults. */
		preferences?: Partial<RecordListPreferences>;
		onPreferencesChange?: (next: RecordListPreferences) => void;
		/** The Columns menu's footnote: where the choice is kept. */
		preferencesNote?: string;
		/** What a row is, one and many: "property", "properties". */
		noun?: [string, string];
		title?: string;
		/** Beside the title. Defaults to the row count. */
		meta?: string;
		/** Before the title: a switch between views of the same list. */
		leading?: Snippet;
		/** The bar's own controls, after the Columns menu. */
		toolbar?: Snippet;
		/** The bar's icon actions, each named by its tooltip. */
		tools?: ListIconAction[];
		/** The bar's one labelled action, last. */
		action?: ListAction;
		/** A row's group, by its label: groups show in the order their first rows come. */
		group?: (row: R) => string;
		/** Names a card after the rows with each column's total over every row: "All three". */
		totalLabel?: string;
		/** The head card. A list whose columns need no heads drops it. */
		head?: boolean;
		/** The tile a row without a photo or its own icon shows. With it every row has a thumbnail. */
		icon?: IconComponent;
		/** Where a row leads. */
		href?: (row: R) => string | undefined;
		/** A row's click, for a detail beside the list. */
		onOpen?: (row: R) => void;
		/** The row whose detail is open, marked. */
		open?: Id | null;
		empty?: Snippet;
		/** After the last row, inside the scroll. */
		footer?: Snippet;
		layout?: 'auto' | 'phone' | 'narrow' | 'wide';
		class?: string;
	} = $props();

	const TITLE: Omit<RecordListColumn<R>, 'key'> = {
		label: 'Name',
		width: { narrow: 'minmax(0, 1fr)', wide: 'minmax(16rem, 1.5fr)' },
		sort: (r) => r.title
	};
	const TRACK = { narrow: '6rem', wide: 'minmax(8rem, 1fr)' };
	/** The first cell's inset: the card's edge to the thumbnail or the title. */
	const FIRST = 'pl-6';

	// ── Columns: the title, then the module's ──
	const resolved = $derived.by(() => {
		const own = columns.find((c) => c.key === 'title');
		return [
			{ ...TITLE, ...own, key: 'title', locked: true },
			...columns.filter((c) => c.key !== 'title').map((c) => ({ ...c, locked: false }))
		].map((c) => ({
			...c,
			on: c.on ?? true,
			track: typeof c.width === 'string' ? { narrow: c.width, wide: c.width } : (c.width ?? TRACK)
		}));
	});

	// ── Layout ──
	let width = $state(0);
	let listOuter = $state(0);
	let listInner = $state(0);
	/** The bar ends where the cards do: clear of the scroll bar's gutter. */
	const edge = $derived(`calc(0.5rem + ${Math.max(0, listOuter - listInner)}px)`);
	const mode = $derived(
		layout !== 'auto' ? layout : listLayout(width)
	);
	const WIDE = $derived(mode === 'wide');
	const PHONE = $derived(mode === 'phone');

	const defaults = $derived<RecordListPreferences>({
		columns: resolved
			.filter((c) => !c.locked && (c.on === true || (c.on === 'wide' && WIDE)))
			.map((c) => c.key)
	});
	const prefs = $derived<RecordListPreferences>({
		columns: preferences?.columns ?? defaults.columns
	});
	function setPreferences(next: RecordListPreferences) {
		preferences = next;
		onPreferencesChange?.(next);
	}
	/** The Columns menu, in the bar, when the heads name a column the viewer can choose. */
	const choosable = $derived(head && resolved.some((c) => !c.locked));

	const shown = $derived(resolved.filter((c) => c.locked || prefs.columns.includes(c.key)));
	const template = $derived(shown.map((c) => (WIDE ? c.track.wide : c.track.narrow)).join(' '));
	/** On a phone, the value beside the title. */
	const phoneColumn = $derived(shown.find((c) => !c.locked && c.align === 'end'));

	// ── Sorting: the viewer's own, kept here until a head is clicked again ──
	let sort = $state<{ key: string; dir: 1 | -1 } | null>(null);
	const sorter = (c: { sort?: RecordListColumn<R>['sort']; text?: RecordListColumn<R>['text'] }) =>
		c.sort ?? c.text;
	/**
	 * Click a head to sort by it, largest first and words from A; again to
	 * reverse; a third time back to the list's order.
	 */
	function firstOf(c: (typeof resolved)[number]): 1 | -1 {
		const by = sorter(c);
		return by && rows.some((r) => typeof by(r) === 'string') ? 1 : -1;
	}
	function sortBy(key: string) {
		const first = firstOf(resolved.find((c) => c.key === key)!);
		sort =
			sort?.key !== key
				? { key, dir: first }
				: sort.dir === first
					? { key, dir: first === 1 ? -1 : 1 }
					: null;
	}
	/** The sort in force: a column the viewer has since unticked no longer sorts. */
	const activeSort = $derived.by(() => {
		const col = sort && shown.find((c) => c.key === sort!.key);
		return sort && col && sorter(col) ? sort : null;
	});

	// ── Groups, in the order their first rows come; a sort orders rows inside them ──
	const groups = $derived.by(() => {
		const out: { key: string; rows: R[] }[] = [];
		for (const r of rows) {
			const key = group ? group(r) : '';
			const g = out.find((x) => x.key === key);
			if (g) g.rows.push(r);
			else out.push({ key, rows: [r] });
		}
		const col = activeSort && shown.find((c) => c.key === activeSort.key);
		const by = col && sorter(col);
		return by ? out.map((g) => ({ key: g.key, rows: orderBy(g.rows, by, activeSort!.dir) })) : out;
	});

	const thumbs = $derived(!!icon || rows.some((r) => r.image || r.icon));
	const openable = $derived(!!href || !!onOpen);
	const totals = $derived(!!totalLabel && shown.some((c) => c.total));
	const count = (n: number) => `${n.toLocaleString()} ${n === 1 ? noun[0] : noun[1]}`;
</script>

{#snippet value(c: (typeof shown)[number], r: R)}
	{#if c.cell}{@render c.cell(r)}{:else}{c.text?.(r) ?? ''}{/if}
{/snippet}

{#snippet flags(r: R, all: boolean)}
	{@const fs = r.flags ?? []}
	{#each all ? fs : fs.slice(0, 1) as f, i (i)}
		<StatusBadge status={f.status} label={f.label} class="flex-none" />
	{/each}
	{#if !all && fs.length > 1}
		<span
			class="pointer-events-auto flex-none whitespace-nowrap"
			title={fs
				.slice(1)
				.map((f) => f.label)
				.join('\n')}
			data-slot="record-more"
			>+{fs.length - 1} more<span class="sr-only"
				>: {fs
					.slice(1)
					.map((f) => f.label)
					.join(', ')}</span
			></span
		>
	{/if}
{/snippet}

{#snippet titleCell(r: R)}
	{#if thumbs}<Thumbnail src={r.image} icon={r.icon ?? icon} class="size-12" />{/if}
	<span class="flex min-w-0 flex-1 flex-col justify-center gap-1">
		<span class="truncate font-medium" data-slot="record-title">{r.title}</span>
		{#if r.flags?.length || r.note}
			<span class="text-muted-foreground flex min-w-0 items-center gap-2 overflow-hidden text-xs">
				{@render flags(r, false)}
				{#if r.note}<span class="min-w-0 truncate">{r.note}</span>{/if}
			</span>
		{/if}
	</span>
{/snippet}

{#snippet opener(r: R, klass: string, style?: string)}
	{@const to = href?.(r)}
	{@const current = open !== null && r.id === open}
	{#if to}
		<a
			href={to}
			class={cn('cursor-pointer', RING_INSET, klass)}
			{style}
			aria-label={r.title}
			aria-current={current ? 'true' : undefined}
			onclick={() => onOpen?.(r)}
			data-slot="record-open"
		></a>
	{:else if onOpen}
		<button
			type="button"
			class={cn('cursor-pointer', RING_INSET, klass)}
			{style}
			aria-label="Open {r.title}"
			aria-current={current ? 'true' : undefined}
			onclick={() => onOpen(r)}
			data-slot="record-open"
		></button>
	{/if}
{/snippet}

{#snippet row(r: R, first: boolean)}
	{@const current = open !== null && r.id === open}
	{@const through = openable && THROUGH}
	{@const mark = cn(
		!first && RULE,
		current &&
			'bg-accent/60 before:bg-primary before:absolute before:inset-y-0 before:left-0 before:w-0.5',
		openable && !current && 'hover:bg-accent/40'
	)}
	{#if PHONE}
		<div class={cn('relative flex gap-3 px-3 py-2.5 text-sm', mark)} data-slot="record-row">
			{@render opener(r, 'absolute inset-0')}
			{#if thumbs}<Thumbnail src={r.image} icon={r.icon ?? icon} class="size-12" />{/if}
			<span class={cn('relative flex min-w-0 flex-1 flex-col gap-1', through)}>
				<span class="flex min-w-0 items-baseline gap-3">
					<span class="min-w-0 flex-1 truncate font-medium" data-slot="record-title">{r.title}</span>
					{#if phoneColumn}
						<span class="flex-none tabular-nums">{@render value(phoneColumn, r)}</span>
					{/if}
				</span>
				{#if r.note}<span class="text-muted-foreground text-xs">{r.note}</span>{/if}
				{#if r.flags?.length}
					<span class="flex flex-wrap items-center gap-1.5">{@render flags(r, true)}</span>
				{/if}
			</span>
		</div>
	{:else}
		<div
			class={cn('relative grid items-stretch', ROW_TEXT, mark)}
			style="grid-template-columns: {template}; {ROW_HEIGHT}"
			data-slot="record-row"
		>
			{@render opener(r, '', 'grid-column: 1 / -1; grid-row: 1;')}
			{#each shown as c, i (c.key)}
				{@const style = `grid-column: ${i + 1}; grid-row: 1;`}
				{#if c.key === 'title' && !c.cell}
					<span class={cn('flex min-w-0 items-center gap-3 py-2.5 pr-2', FIRST, through)} {style}>
						{@render titleCell(r)}
					</span>
				{:else}
					<!-- A text cell stays a block so it ends in an ellipsis; a cell of the module's markup centres it. -->
					<span
						class={cn(
							CELL,
							i === 0 && FIRST,
							through,
							'self-center',
							c.align === 'end' && cn(END, 'tabular-nums'),
							c.cell && 'flex items-center',
							c.cell && c.align === 'end' && 'justify-end'
						)}
						{style}
					>
						{@render value(c, r)}
					</span>
				{/if}
			{/each}
		</div>
	{/if}
{/snippet}

{#snippet total()}
	{#if PHONE}
		<span class="min-w-0 flex-1 truncate">{totalLabel}</span>
		{#if phoneColumn?.total}
			<span class="tabular-nums">{phoneColumn.total(rows)}</span>
		{/if}
	{:else}
		{#each shown as c, i (c.key)}
			{#if i === 0}
				<span class={cn(CELL, FIRST)} style="grid-column: 1;">{totalLabel}</span>
			{:else if c.total}
				<span class={cn(CELL, c.align === 'end' && END, 'tabular-nums')} style="grid-column: {i + 1};">
					{c.total(rows)}
				</span>
			{/if}
		{/each}
	{/if}
{/snippet}

<div
	bind:clientWidth={width}
	class={cn('relative flex min-h-0 flex-1 flex-col', className)}
	data-slot="record-list"
	data-layout={mode}
	{...restProps}
>
	{#if title || meta || leading || toolbar || tools.length || action}
		<ListToolbar
			{title}
			meta={meta ?? count(rows.length)}
			{leading}
			{tools}
			{action}
			style="padding-right: {edge};"
		>
			{#if choosable}
				<LedgerColumns
					offered={resolved.map((c) => ({ key: c.key, label: c.label, locked: c.locked }))}
					preferences={prefs}
					note={preferencesNote}
					onchange={setPreferences}
					onreset={() => setPreferences(defaults)}
					owner="record"
				/>
			{/if}
			{@render toolbar?.()}
		</ListToolbar>
	{/if}

	<div
		bind:offsetWidth={listOuter}
		bind:clientWidth={listInner}
		class="relative min-h-0 flex-1 overflow-auto px-2 pb-3 [scrollbar-width:thin]"
		style="scrollbar-gutter: stable;"
		data-slot="record-rows"
	>
		{#if head && !PHONE}
			<div class={HEAD_GROUND}>
				<div class={HEAD} style:grid-template-columns={template} data-slot="record-head">
					{#each shown as c, i (c.key)}
						{@const mine = activeSort?.key === c.key ? activeSort : null}
						<HeadCell
							label={c.head ?? c.label}
							name={c.label}
							align={c.align}
							sortable={!!sorter(c)}
							sort={mine ? (mine.dir === -1 ? 'desc' : 'asc') : null}
							first={firstOf(c) === 1 ? 'asc' : 'desc'}
							onsort={() => sortBy(c.key)}
							owner="record"
							class={i === 0 ? FIRST : undefined}
						/>
					{/each}
				</div>
			</div>
		{/if}

		{#if rows.length === 0}
			{#if empty}{@render empty()}{:else}<EmptyState title="No {noun[1]}" />{/if}
		{:else}
			{#each groups as g, gi (g.key)}
				{#if group}
					<div class={groupSpacing(gi)}>
						<div
							class={cn(GROUP, PHONE ? 'flex items-center gap-2 px-0.5' : 'grid items-center')}
							style:grid-template-columns={PHONE ? undefined : template}
							data-slot="record-group"
						>
							{#if PHONE}
								<h3 class={cn(GROUP_LABEL, 'whitespace-nowrap')}>{g.key}</h3>
								<span class="min-w-0 flex-1 truncate">{g.rows.length.toLocaleString()}</span>
							{:else}
								<div
									class="flex min-w-0 items-baseline gap-3 overflow-hidden pl-3 whitespace-nowrap"
									style="grid-column: 1;"
								>
									<h3 class={GROUP_LABEL}>{g.key}</h3>
									<span class="min-w-0 truncate">{count(g.rows.length)}</span>
								</div>
								{#each shown as c, i (c.key)}
									{#if i > 0 && c.total}
										<span
											class={cn(CELL, c.align === 'end' && END, 'tabular-nums')}
											style="grid-column: {i + 1};">{c.total(g.rows)}</span
										>
									{/if}
								{/each}
							{/if}
						</div>
					</div>
				{/if}
				<div class={CARD} data-slot="record-card">
					{#each g.rows as r, ri (r.id)}
						{@render row(r, ri === 0)}
					{/each}
				</div>
			{/each}
			{#if totals}
				<div class={cn(CARD, 'mt-3')} data-slot="record-total">
					<div
						class={cn(
							'font-semibold',
							PHONE ? 'flex items-center gap-3 px-3 py-3 text-sm' : cn('grid items-center', ROW_TEXT)
						)}
						style={PHONE ? undefined : `grid-template-columns: ${template}; ${ROW_HEIGHT}`}
					>
						{@render total()}
					</div>
				</div>
			{/if}
		{/if}
		{@render footer?.()}
	</div>
</div>
