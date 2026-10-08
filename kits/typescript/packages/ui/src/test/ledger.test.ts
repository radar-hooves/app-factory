/**
 * The ledger's contract, in the environment that can judge it.
 *
 * jsdom has no layout, so what the operator ruled about the LOOK — the head
 * card exactly as wide as the group cards, its columns lined up with theirs,
 * a row's text centred whether or not it has a note — is measured in a real
 * engine (`harness/drive.mjs`, `?surface=ledger`). What is held here is the
 * behaviour: newest first, grouped by the viewer's period, the Date column
 * gone by day, the viewer's columns and the balance last, money out bracketed,
 * one review dot, a synthetic row opening to its statement lines, the bulk bar,
 * a row opening in place, and every choice emitted for the consumer to keep.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import Download from '@lucide/svelte/icons/download';
import Plus from '@lucide/svelte/icons/plus';
import Harness from './ledger.svelte';
import {
	blocksOf,
	fySpan,
	ledgerItems,
	windowOf,
	groupRows,
	ledgerDate,
	periodKey,
	periodLabel
} from '$lib/components/ui/ledger/ledger.js';
import type { LedgerColumn, LedgerRow } from '$lib/components/ui/ledger';

type Row = LedgerRow & { category?: string };

const ROWS: Row[] = [
	{
		id: 1,
		date: '2026-09-02',
		title: 'Bunnings',
		note: 'Hinges for the back gate',
		amount: '-84.50',
		balance: '5120.10',
		category: 'Repairs',
		attachment: 'Receipt 1182'
	},
	{
		id: 2,
		date: '2026-09-15',
		title: 'Ray White',
		note: 'Rent, September',
		amount: '2400.00',
		balance: '7520.10',
		review: true,
		category: 'Rent'
	},
	{ id: 3, date: '2026-10-01', title: 'Urban Utilities', amount: -312.4, balance: 5997.7 },
	{
		id: 4,
		date: '2026-09-15',
		title: 'Brisbane City Council',
		amount: -1210,
		balance: 6310.1,
		category: 'Rates',
		origins: {
			summary: 'Split from one statement line',
			lines: [
				{
					date: '2026-09-15',
					description: 'BPAY BRISBANE CITY COUNCIL 4401',
					source: 'Statement 23, line 14',
					amount: -1210
				}
			]
		}
	}
];

const COLUMNS: LedgerColumn<Row>[] = [
	{ key: 'category', label: 'Category', text: (r) => r.category ?? 'Uncategorised' },
	{ key: 'labels', label: 'Labels', on: false, text: () => 'tax' },
	{ key: 'balance', label: 'Running balance', head: 'Balance' }
];

function mount(props: Record<string, unknown> = {}) {
	const r = render(Harness, { props: { rows: ROWS, columns: COLUMNS, ...props } });
	const all = (sel: string) => [...r.container.querySelectorAll<HTMLElement>(sel)];
	const probe = (name: string) =>
		r.container.querySelector(`[data-probe="${name}"]`)?.textContent ?? '';
	const heads = () =>
		all('[data-slot="ledger-head"] > :not(:first-child)').map((s) => s.textContent?.trim());
	const titles = () =>
		all('[data-slot="ledger-title"] > span:first-child > span:first-child').map(
			(s) => s.textContent
		);
	return { ...r, all, probe, heads, titles };
}

/** Open the Columns menu, which portals out of the ledger into the body. */
async function openColumns() {
	await fireEvent.click(screen.getByRole('button', { name: 'Columns, balance and grouping' }));
	return document.body.querySelector<HTMLElement>('[data-slot="ledger-columns"]')!;
}

describe('Ledger: rows, newest first, grouped by month until the viewer chooses', () => {
	it('groups by month, newest first, each label carrying its count and net', () => {
		const { all, titles } = mount();
		const groups = all('[data-slot="ledger-group"]').map((g) =>
			g.textContent?.replace(/\s+/g, ' ').trim()
		);
		expect(groups).toEqual([
			'October 2026 1 transaction ($312.40)',
			'September 2026 3 transactions $1,105.50'
		]);
		// A day's rows keep the order the consumer gave them.
		expect(titles()).toEqual(['Urban Utilities', 'Ray White', 'Brisbane City Council', 'Bunnings']);
	});

	it('puts each group on one card, under one head card', () => {
		const { all } = mount();
		expect(all('[data-slot="ledger-head"]')).toHaveLength(1);
		expect(all('[data-slot="ledger-card"]')).toHaveLength(2);
	});

	it('prints money out in brackets and money in plain', () => {
		const { all } = mount();
		const amounts = all('[data-slot="ledger-amount"]').map((a) => a.textContent?.trim());
		expect(amounts).toEqual(['($312.40)', '$2,400.00', '($1,210.00)', '($84.50)']);
	});

	it('stacks the note under the title, and a row with no note has one line', () => {
		const { all } = mount();
		const blocks = all('[data-slot="ledger-title"]');
		expect(blocks[1]!.children).toHaveLength(2);
		expect(blocks[1]!.textContent).toContain('Rent, September');
		expect(blocks[0]!.children).toHaveLength(1);
	});

	it('shows one review chip beside the title on line one, only on the row that needs one', () => {
		const { all } = mount();
		const chips = all('[data-slot="ledger-review"]');
		expect(chips).toHaveLength(1);
		expect(chips[0]).toHaveTextContent('Review');
		expect(chips[0]!.querySelector('.ds-chip-warning')).not.toBeNull();
		const lineOne = chips[0]!.parentElement!;
		expect(lineOne).toBe(lineOne.closest('[data-slot="ledger-title"]')!.firstElementChild);
		expect(lineOne).toHaveTextContent('Ray White');
		// The title is the one that gives way; the chip never shrinks.
		expect(lineOne.firstElementChild!.className).toContain('truncate');
		expect(chips[0]!.className).toContain('flex-none');
	});

	it('words the chip as the module does, and keeps the phone’s title and chip on line one', () => {
		const { all } = mount({
			layout: 'phone',
			rows: [{ id: 1, date: '2026-09-15', title: 'Staking', amount: 5, review: 'info', reviewLabel: 'Unpriced' }]
		});
		const chip = all('[data-slot="ledger-review"]')[0]!;
		expect(chip).toHaveTextContent('Unpriced');
		expect(chip.querySelector('.ds-chip-info')).not.toBeNull();
		expect(chip.parentElement).toHaveTextContent('Staking');
	});

	it('trails the title with a paperclip named on hover, a button when the consumer opens it', async () => {
		let opened: Row | null = null;
		const { all } = mount({ onAttachment: (r: Row) => (opened = r) });
		const clip = all('[data-slot="ledger-attachment"]');
		expect(clip).toHaveLength(1);
		expect(clip[0]).toHaveAttribute('title', 'Receipt 1182');
		await fireEvent.click(screen.getByRole('button', { name: 'Open Receipt 1182' }));
		expect(opened!.id).toBe(1);
	});

	it('says what is missing when there are no rows', () => {
		mount({ rows: [] });
		expect(screen.getByText('No transactions')).toBeInTheDocument();
	});
});

describe('Ledger: the viewer’s columns, the balance last', () => {
	it('shows date, title and amount, then the module’s columns that start on', () => {
		const { heads } = mount();
		expect(heads()).toEqual(['Date', 'Description', 'Amount', 'Category']);
	});

	it('offers every column as a tick, the three fixed ones locked and the balance last', async () => {
		mount();
		const menu = await openColumns();
		const labels = within(menu)
			.getAllByRole('checkbox')
			.map((c) => c.closest('label')!.textContent?.replace(/\s+/g, ' ').trim());
		expect(labels).toEqual([
			'Date Always shown',
			'Description Always shown',
			'Amount Always shown',
			'Category',
			'Labels',
			'Running balance'
		]);
	});

	it('ticks the running balance on as the last column, and emits it to be kept', async () => {
		const { heads, probe } = mount();
		const menu = await openColumns();
		await fireEvent.click(within(menu).getAllByRole('checkbox')[5]!);
		expect(heads()).toEqual(['Date', 'Description', 'Amount', 'Category', 'Balance']);
		expect(JSON.parse(probe('emitted'))).toEqual({
			columns: ['category', 'balance'],
			period: 'month'
		});

		await fireEvent.click(within(menu).getAllByRole('checkbox')[4]!);
		expect(heads()).toEqual(['Date', 'Description', 'Amount', 'Category', 'Labels', 'Balance']);
	});

	it('takes the consumer’s kept columns, and ignores one it no longer offers', () => {
		const { heads } = mount({ preferences: { columns: ['balance', 'gone'] } });
		expect(heads()).toEqual(['Date', 'Description', 'Amount', 'Balance']);
	});

	it('reads a stale kept period as the default, and echoes no foreign key back', async () => {
		const { all, probe } = mount({
			preferences: { period: 'year', columns: undefined, density: 'one_line' }
		});
		expect(all('[data-slot="ledger-group"]')[0]).toHaveTextContent('October 2026');
		const menu = await openColumns();
		await fireEvent.click(within(menu).getAllByRole('checkbox')[4]!);
		expect(JSON.parse(probe('emitted'))).toEqual({
			columns: ['category', 'labels'],
			period: 'month'
		});
	});

	it('resets to the module’s defaults', async () => {
		const { heads, probe } = mount({ preferences: { columns: ['balance'], period: 'day' } });
		const menu = await openColumns();
		await fireEvent.click(within(menu).getByRole('button', { name: 'Reset' }));
		expect(heads()).toEqual(['Date', 'Description', 'Amount', 'Category']);
		expect(JSON.parse(probe('emitted'))).toEqual({ columns: ['category'], period: 'month' });
	});

	it('names the title and amount columns as the module does', () => {
		const { heads } = mount({
			columns: [
				{ key: 'title', label: 'Security' },
				{ key: 'amount', label: 'Consideration' }
			]
		});
		expect(heads()).toEqual(['Date', 'Security', 'Consideration']);
	});
});

describe('Ledger: the period', () => {
	it('regroups when the viewer picks a period, and emits it', async () => {
		const { all, probe } = mount();
		const menu = await openColumns();
		await fireEvent.click(within(menu).getByText('Calendar year'));
		expect(all('[data-slot="ledger-group"]').map((g) => g.textContent?.trim().slice(0, 4))).toEqual(
			['2026']
		);
		expect(JSON.parse(probe('emitted')).period).toBe('cy');
	});

	it('by day, heads each day with its date, drops the Date column and closes nothing', () => {
		const { all, heads } = mount({ preferences: { period: 'day' } });
		expect(heads()).toEqual(['Description', 'Amount', 'Category']);
		const groups = all('[data-slot="ledger-group"]');
		expect(groups.map((g) => g.tagName)).toEqual(['DIV', 'DIV', 'DIV']);
		// One row on a day: the date alone. Two: their count and net too.
		expect(groups[0]!.textContent?.trim()).toBe('Thursday 1 Oct');
		expect(groups[1]!.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Tuesday 15 Sep 2 transactions $1,190.00'
		);
	});

	it('by financial year, from the configured start', () => {
		const july = mount({ preferences: { period: 'fy' } });
		expect(july.all('[data-slot="ledger-group"]')[0]!.textContent).toContain('FY 2026–27');
		july.unmount();
		const january = mount({ preferences: { period: 'fy' }, fyStart: 1 });
		expect(january.all('[data-slot="ledger-group"]')[0]!.textContent).toContain('FY 2026');
		expect(january.all('[data-slot="ledger-group"]')[0]!.textContent).not.toContain('–');
	});

	it('with none, is one card and no group labels', () => {
		const { all } = mount({ preferences: { period: 'none' } });
		expect(all('[data-slot="ledger-group"]')).toHaveLength(0);
		expect(all('[data-slot="ledger-card"]')).toHaveLength(1);
		expect(all('[data-slot="ledger-row"]')).toHaveLength(4);
	});

	it('closes and opens a group from its label', async () => {
		const { all } = mount();
		const september = screen.getByRole('button', { name: /September 2026/ });
		expect(september).toHaveAttribute('aria-expanded', 'true');
		await fireEvent.click(september);
		expect(september).toHaveAttribute('aria-expanded', 'false');
		expect(all('[data-slot="ledger-row"]')).toHaveLength(1);
		await fireEvent.click(september);
		expect(all('[data-slot="ledger-row"]')).toHaveLength(4);
	});
});

describe('Ledger: a row not as printed', () => {
	it('carries the one badge, which opens it to the statement lines it was made from', async () => {
		const { all, probe } = mount();
		const badge = screen.getByRole('button', { name: /Not as printed/ });
		expect(all('[data-slot="ledger-not-printed"]')).toHaveLength(1);
		expect(badge).toHaveAttribute('aria-expanded', 'false');

		await fireEvent.click(badge);
		expect(badge).toHaveAttribute('aria-expanded', 'true');
		const lines = screen.getByRole('list', { name: 'The statement lines it is made of' });
		expect(lines).toHaveTextContent('BPAY BRISBANE CITY COUNCIL 4401');
		expect(lines).toHaveTextContent('Statement 23, line 14');
		expect(lines).toHaveTextContent('Split from one statement line');

		await fireEvent.click(within(lines).getByRole('button', { name: 'Undo' }));
		expect(probe('acted')).toBe('undo 4');
	});
});

describe('Ledger: ticking rows', () => {
	it('swaps the toolbar for a bulk bar of what the ticked rows allow', async () => {
		const { all, probe } = mount();
		expect(all('[data-slot="ledger-toolbar"]')).toHaveLength(1);
		await fireEvent.click(screen.getByRole('checkbox', { name: /^Select Ray White/ }));
		await fireEvent.click(screen.getByRole('checkbox', { name: /^Select Bunnings/ }));

		expect(all('[data-slot="ledger-toolbar"]')).toHaveLength(0);
		const bar = screen.getByRole('toolbar', { name: 'Act on the ticked rows' });
		expect(bar).toHaveTextContent('2 ticked');
		expect(bar).toHaveTextContent('net $2,315.50');

		await fireEvent.click(within(bar).getByRole('button', { name: 'Mark reviewed' }));
		expect(probe('acted')).toBe('2,1');

		await fireEvent.click(within(bar).getAllByRole('button', { name: 'Clear the ticks' }).at(-1)!);
		expect(probe('selected')).toBe('');
		expect(all('[data-slot="ledger-toolbar"]')).toHaveLength(1);
	});

	it('ticks every row in an open group from the head', async () => {
		const { probe } = mount();
		await fireEvent.click(screen.getByRole('button', { name: /October 2026/ }));
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select every transaction shown' }));
		expect(probe('selected').split(',').sort()).toEqual(['1', '2', '4']);
	});

	it('offers no ticks when the consumer has nothing to do with them', () => {
		mount({ withBulk: false });
		expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
		// The review chip is not a tick's business.
		expect(document.querySelectorAll('[data-slot="ledger-review"]')).toHaveLength(1);
	});
});

describe('Ledger: a row opened in place', () => {
	it('lifts the row out of its card as the consumer’s content, and closes back', async () => {
		const { all, probe } = mount();
		await fireEvent.click(screen.getByRole('button', { name: /^Open Brisbane City Council/ }));

		expect(probe('open')).toBe('4');
		const lifted = all('[data-slot="ledger-open"]');
		expect(lifted).toHaveLength(1);
		expect(lifted[0]).toHaveTextContent('Editing Brisbane City Council');
		// Its content can line up under the columns: the amount sits on line 4.
		expect(probe('amount-line')).toBe('4');
		// September's card is split around it: Ray White above, Bunnings below.
		expect(all('[data-slot="ledger-card"]')).toHaveLength(3);

		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(probe('open')).toBe('');
		expect(all('[data-slot="ledger-open"]')).toHaveLength(0);
		expect(all('[data-slot="ledger-card"]')).toHaveLength(2);
	});

	it('does not open a row without an editor', () => {
		mount({ withEditor: false });
		expect(screen.queryByRole('button', { name: /^Open Ray White/ })).not.toBeInTheDocument();
	});
});

describe('Ledger: on a phone', () => {
	it('drops the head and the ticks, and reads the date into line two', () => {
		const { all } = mount({ layout: 'phone' });
		expect(all('[data-slot="ledger-head"]')).toHaveLength(0);
		expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
		const rent = all('[data-slot="ledger-row"]').find((r) => r.textContent?.includes('Ray White'))!;
		expect(rent).toHaveTextContent('15 Sep · Rent, September');
	});

	it('puts the running balance under the amount when it is ticked', () => {
		const { all } = mount({ layout: 'phone', preferences: { columns: ['balance'] } });
		const rent = all('[data-slot="ledger-row"]').find((r) => r.textContent?.includes('Ray White'))!;
		expect(rent).toHaveTextContent('$2,400.00 $7,520.10');
	});
});

/** An account with years of history: three rows a day back from 1 Oct 2026. */
const many = (n: number): Row[] =>
	Array.from({ length: n }, (_, i) => ({
		id: i + 1,
		date: new Date(Date.UTC(2026, 9, 1 - Math.floor(i / 3))).toISOString().slice(0, 10),
		title: `Payee ${i + 1}`,
		amount: i % 3 ? -40 : 600
	}));

describe('Ledger: a long account mounts only the rows near the view', () => {
	it('mounts a screen of 5,000 rows, and pads for the rest so the scroll stays true', () => {
		const { all, container } = mount({ rows: many(5000), preferences: { period: 'none' } });
		const mounted = all('[data-slot="ledger-row"]').length;
		expect(mounted).toBeGreaterThan(5);
		expect(mounted).toBeLessThan(60);
		const body = container.querySelector<HTMLElement>('[data-slot="ledger-body"]')!;
		// What is not mounted is stood in for at its estimated height: about 3.5rem a row.
		expect(parseFloat(body.style.paddingBottom)).toBeGreaterThan((5000 - mounted) * 50);
		expect(parseFloat(body.style.paddingTop)).toBe(0);
	});

	it('keeps every group’s count and net while its rows are unmounted', () => {
		const { all } = mount({ rows: many(5000) });
		const october = all('[data-slot="ledger-group"]')[0]!;
		expect(october).toHaveTextContent('October 2026 3 transactions');
		// Months below the window are padding, not mounted heads.
		expect(all('[data-slot="ledger-group"]').length).toBeLessThan(5);
	});

	it('ticks all 5,000 from the head, mounted or not', async () => {
		const { probe } = mount({ rows: many(5000), preferences: { period: 'none' } });
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select every transaction shown' }));
		expect(probe('selected').split(',')).toHaveLength(5000);
		expect(screen.getByRole('toolbar', { name: 'Act on the ticked rows' })).toHaveTextContent(
			'5,000 ticked'
		);
	});
});

describe('Ledger: the locale', () => {
	it('prints every figure in the locale it is given', () => {
		const { all } = mount({ rows: many(1200), locale: 'de-DE', preferences: { period: 'none' } });
		expect(screen.getByRole('toolbar', { name: 'This ledger' })).toHaveTextContent(
			'1.200 transactions'
		);
		expect(all('[data-slot="ledger-amount"]')[1]!.textContent?.trim()).toMatch(
			/^\(40,00\s?AU\$\)$/
		);
	});

	it('defaults to the house’s en-AU', () => {
		mount({ rows: many(1200), preferences: { period: 'none' } });
		expect(screen.getByRole('toolbar', { name: 'This ledger' })).toHaveTextContent(
			'1,200 transactions'
		);
	});
});

describe('Ledger: closing a group with a row open in it', () => {
	it('closes the row too, and says so', async () => {
		const { all, probe } = mount();
		await fireEvent.click(screen.getByRole('button', { name: /^Open Ray White/ }));
		expect(probe('open')).toBe('2');
		await fireEvent.click(screen.getByRole('button', { name: /September 2026/ }));
		expect(probe('open')).toBe('');
		expect(all('[data-slot="ledger-open"]')).toHaveLength(0);
		expect(JSON.parse(probe('open-changes'))).toEqual([2, null]);
	});

	it('leaves the open row alone when another group closes', async () => {
		const { probe } = mount();
		await fireEvent.click(screen.getByRole('button', { name: /^Open Ray White/ }));
		await fireEvent.click(screen.getByRole('button', { name: /October 2026/ }));
		expect(probe('open')).toBe('2');
	});
});

describe('Ledger: a financial year that starts in no month', () => {
	it('groups from July and says why, in development', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { all } = mount({ preferences: { period: 'fy' }, fyStart: 13 });
		expect(all('[data-slot="ledger-group"]')[0]).toHaveTextContent('FY 2026–27');
		expect(error).toHaveBeenCalledWith(expect.stringContaining('fyStart is a month from 1 to 12'));
		error.mockRestore();
	});
});

describe('the ledger’s window', () => {
	const rows = many(6);
	const groups = [
		{ key: 'a', rows: rows.slice(0, 3) },
		{ key: 'b', rows: rows.slice(3) }
	];

	it('lists each group’s head and rows, a run breaking where a row is open', () => {
		const items = ledgerItems(groups, { heads: true, closed: () => false, open: 2 });
		expect(
			items.map((it) =>
				it.kind === 'row' ? `${it.key}${it.first ? '<' : ''}${it.last ? '>' : ''}` : it.key
			)
		).toEqual(['h:a', 'r:1<>', 'o:2', 'r:3<>', 'h:b', 'r:4<', 'r:5', 'r:6>']);
	});

	it('lists a closed group as its head alone', () => {
		const items = ledgerItems(groups, { heads: true, closed: (k) => k === 'a', open: null });
		expect(items.map((it) => it.key)).toEqual(['h:a', 'h:b', 'r:4', 'r:5', 'r:6']);
	});

	it('finds the items a window overlaps', () => {
		const starts = [0, 10, 20, 30, 40, 50];
		expect(windowOf(starts, 15, 35)).toEqual([1, 3]);
		expect(windowOf(starts, -100, 5)).toEqual([0, 0]);
		expect(windowOf(starts, 60, 90)).toEqual([5, 4]);
	});

	it('cuts a card where the window cuts it, and only there', () => {
		const items = ledgerItems(groups, { heads: true, closed: () => false, open: null });
		// Items: h:a r:1 r:2 r:3 h:b r:4 r:5 r:6.
		expect(blocksOf(items, 5, 7)).toMatchObject([
			{ kind: 'card', cutTop: false, cutBottom: false }
		]);
		expect(blocksOf(items, 6, 7)).toMatchObject([{ kind: 'card', cutTop: true, cutBottom: false }]);
		expect(blocksOf(items, 3, 5)).toMatchObject([
			{ kind: 'card', key: 'c:a:0', cutTop: true, cutBottom: false },
			{ kind: 'head' },
			{ kind: 'card', key: 'c:b:0', cutTop: false, cutBottom: true }
		]);
	});
});

describe('the ledger’s periods', () => {
	it('starts a week on Monday', () => {
		expect(periodKey('2026-09-20', 'week')).toBe('2026-09-14');
		expect(periodKey('2026-09-14', 'week')).toBe('2026-09-14');
	});

	it('labels a week across a month and across a year', () => {
		expect(periodLabel('2026-09-14', 'week')).toBe('14 to 20 Sep 2026');
		expect(periodLabel('2026-09-28', 'week')).toBe('28 Sep to 4 Oct 2026');
		expect(periodLabel('2025-12-29', 'week', 7, false)).toBe('29 Dec 2025 to 4 Jan 2026');
	});

	it('names a financial year by its start, and spans it to now while it is open', () => {
		expect(periodKey('2026-06-30', 'fy')).toBe('2026');
		expect(periodKey('2026-07-01', 'fy')).toBe('2027');
		expect(periodLabel('2026', 'fy')).toBe('FY 2025–26');
		expect(fySpan('2026', 7, '2026-09-01')).toBe('Jul 2025 to Jun 2026');
		expect(fySpan('2027', 7, '2026-09-01')).toBe('Jul 2026 to now');
		expect(periodKey('2026-03-31', 'fy', 4)).toBe('2026');
		expect(fySpan('2026', 4, '2027-01-01')).toBe('Apr 2025 to Mar 2026');
	});

	it('groups newest first and keeps a day’s rows in the order given', () => {
		const groups = groupRows(ROWS, 'month');
		expect(groups.map((g) => [g.key, g.rows.map((r) => r.id)])).toEqual([
			['2026-10', [3]],
			['2026-09', [2, 4, 1]]
		]);
	});

	it('reads a date without a time zone', () => {
		expect(ledgerDate('2026-07-01')).toBe('1 Jul 2026');
		expect(ledgerDate('2026-07-01', false)).toBe('1 Jul');
	});
});

describe('Ledger: column heads sort', () => {
	const sortHead = (name: RegExp) => screen.getByRole('button', { name });
	const SORTABLE: Row[] = [
		{ id: 1, date: '2026-09-02', title: 'Bunnings', amount: -84.5, balance: 1, category: 'b' },
		{ id: 2, date: '2026-09-15', title: 'Ray White', amount: 2400, balance: 2, category: 'a' },
		{ id: 3, date: '2026-10-01', title: 'Urban', amount: -312.4, balance: 3, category: 'c' },
		{ id: 4, date: '2026-08-20', title: 'Council', amount: 9, balance: 4 }
	];

	const DEFAULT = ['Urban', 'Ray White', 'Bunnings', 'Council'];

	it('sorts inside each group, largest first, reverses on the second click, group heads kept', async () => {
		const { all, titles } = mount({ rows: SORTABLE });
		const groupHeads = all('[data-slot="ledger-group"]').length;
		expect(groupHeads).toBe(3);
		expect(titles()).toEqual(DEFAULT);

		await fireEvent.click(sortHead(/^Sort by Amount/));
		expect(all('[data-slot="ledger-group"]')).toHaveLength(groupHeads);
		expect(all('[data-slot="ledger-card"]')).toHaveLength(groupHeads);
		expect(titles()).toEqual(['Urban', 'Ray White', 'Bunnings', 'Council']);
		expect(sortHead(/^Sorted by Amount, descending/)).toHaveAttribute('data-sort', 'desc');

		await fireEvent.click(sortHead(/^Sorted by Amount/));
		expect(titles()).toEqual(['Urban', 'Bunnings', 'Ray White', 'Council']);
		expect(sortHead(/^Sorted by Amount, ascending/)).toHaveAttribute('data-sort', 'asc');
	});

	it('returns to the default order, newest first, on the third click', async () => {
		const { titles } = mount({ rows: SORTABLE });
		await fireEvent.click(sortHead(/^Sort by Amount/));
		await fireEvent.click(sortHead(/^Sorted by Amount/));
		await fireEvent.click(sortHead(/^Sorted by Amount, ascending/));
		expect(titles()).toEqual(DEFAULT);
		const head = sortHead(/^Sort by Amount/);
		expect(head).not.toHaveAttribute('data-sort');
	});

	it('keeps a closed group closed through a sort and its clearing', async () => {
		const { titles } = mount({ rows: SORTABLE });
		await fireEvent.click(screen.getByRole('button', { name: /September 2026/ }));
		expect(titles()).toEqual(['Urban', 'Council']);
		await fireEvent.click(sortHead(/^Sort by Amount/));
		expect(titles()).toEqual(['Urban', 'Council']);
		await fireEvent.click(sortHead(/^Sorted by Amount/));
		await fireEvent.click(sortHead(/^Sorted by Amount/));
		expect(titles()).toEqual(['Urban', 'Council']);
	});

	it('keeps the flat list flat when grouped by none, sorting the whole run', async () => {
		const { all, titles } = mount({ rows: SORTABLE, preferences: { period: 'none' } });
		await fireEvent.click(sortHead(/^Sort by Amount/));
		expect(all('[data-slot="ledger-group"]')).toHaveLength(0);
		expect(all('[data-slot="ledger-card"]')).toHaveLength(1);
		expect(titles()).toEqual(['Ray White', 'Council', 'Bunnings', 'Urban']);
	});

	it('sorts a module column by its own sort value, not its display text', async () => {
		const columns: LedgerColumn<Row>[] = [
			{
				key: 'qty',
				label: 'Quantity',
				text: (r) => `${r.id} units`,
				sort: (r) => -Number(r.id)
			}
		];
		const { titles } = mount({ rows: SORTABLE, columns });
		await fireEvent.click(sortHead(/^Sort by Quantity/));
		// Largest sort value first within each month: Bunnings (id 1) leads Ray White (id 2).
		expect(titles()).toEqual(['Urban', 'Bunnings', 'Ray White', 'Council']);
	});

	it('sorts a text column by its text, empty last either way, and a cell-only column not at all', async () => {
		const columns: LedgerColumn<Row>[] = [
			{ key: 'category', label: 'Category', text: (r) => r.category ?? '' },
			{ key: 'pic', label: 'Picture', cell: undefined }
		];
		const { titles } = mount({ rows: SORTABLE, columns });
		await fireEvent.click(sortHead(/^Sort by Category/));
		expect(titles()).toEqual(['Urban', 'Bunnings', 'Ray White', 'Council']);
		await fireEvent.click(sortHead(/^Sorted by Category/));
		expect(titles()).toEqual(['Urban', 'Ray White', 'Bunnings', 'Council']);
		expect(screen.queryByRole('button', { name: /Sort by Picture/ })).toBeNull();
	});

	it('never sorts the running balance', () => {
		mount({ rows: SORTABLE, preferences: { columns: ['category', 'balance'] } });
		expect(screen.queryByRole('button', { name: /Sort by (Balance|Running balance)/ })).toBeNull();
	});

	it('keeps the Date column hidden when sorting inside day groups', async () => {
		const { heads } = mount({ rows: SORTABLE, preferences: { period: 'day' } });
		await fireEvent.click(sortHead(/^Sort by Amount/));
		expect(heads()).not.toContain('Date');
	});

	it('drops the sort when its column is unticked, back to newest first', async () => {
		const { titles } = mount({ rows: SORTABLE, preferences: { columns: ['category'] } });
		await fireEvent.click(sortHead(/^Sort by Category/));
		expect(titles()).toEqual(['Urban', 'Bunnings', 'Ray White', 'Council']);
		const menu = await openColumns();
		await fireEvent.click(within(menu).getByRole('checkbox', { name: 'Category' }));
		expect(titles()).toEqual(DEFAULT);
	});
});

describe('Ledger: one control opens or closes every group', () => {
	it('collapses every group, then expands them, from the head', async () => {
		const { all } = mount();
		const toggle = screen.getByRole('button', { name: 'Collapse every group' });
		expect(all('[data-slot="ledger-head"] [data-slot="ledger-all-groups"]')).toHaveLength(1);
		await fireEvent.click(toggle);
		expect(all('[data-slot="ledger-row"]')).toHaveLength(0);
		expect(all('[data-slot="ledger-group"]')).toHaveLength(2);

		await fireEvent.click(screen.getByRole('button', { name: 'Expand every group' }));
		expect(all('[data-slot="ledger-row"]')).toHaveLength(4);
	});

	it('offers to collapse again only once every group is open, and closes a row open in a group', async () => {
		const { all } = mount();
		await fireEvent.click(screen.getByRole('button', { name: /October 2026/ }));
		expect(screen.getByRole('button', { name: 'Expand every group' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Expand every group' }));
		await fireEvent.click(screen.getByRole('button', { name: /^Open Bunnings/ }));
		expect(all('[data-slot="ledger-open"]')).toHaveLength(1);
		await fireEvent.click(screen.getByRole('button', { name: 'Collapse every group' }));
		expect(all('[data-slot="ledger-open"]')).toHaveLength(0);
	});

	it('is absent when nothing is grouped: by day or none', async () => {
		const day = mount({ preferences: { period: 'day' } });
		expect(day.all('[data-slot="ledger-all-groups"]')).toHaveLength(0);
		day.unmount();
		const none = mount({ preferences: { period: 'none' } });
		expect(none.all('[data-slot="ledger-all-groups"]')).toHaveLength(0);
	});

	it('still keeps the select-all checkbox beside it', () => {
		mount();
		expect(screen.getByRole('checkbox', { name: 'Select every transaction shown' })).toBeInTheDocument();
	});
});

describe('Ledger: a conversion inside the account', () => {
	const CONV: Row[] = [
		{ id: 1, date: '2026-09-15', title: 'Bitcoin', amount: 502, conversion: true },
		{ id: 2, date: '2026-09-14', title: 'Rent', amount: 100 },
		{ id: 3, date: '2026-09-13', title: 'Fees', amount: -30 },
		{ id: 4, date: '2026-09-12', title: 'Sold', amount: -200, conversion: true }
	];

	it('shows its amount plain, neither income green nor muted', () => {
		const { all } = mount({ rows: CONV });
		const [btc, rent, , sold] = all('[data-slot="ledger-amount"]');
		expect(btc!.className).not.toContain('text-status-success');
		expect(rent!.className).toContain('text-status-success');
		expect(sold!.className).not.toContain('text-status-success');
		expect(btc).toHaveTextContent('$502.00');
		expect(sold).toHaveTextContent('($200.00)');
	});

	it('counts in no group total: in, out or net', () => {
		const { all } = mount({ rows: CONV, layout: 'wide' });
		const group = all('[data-slot="ledger-group"]')[0]!.textContent!.replace(/\s+/g, ' ');
		expect(group).toContain('4 transactions');
		expect(group).toContain('$70.00');
		expect(group).toContain('In $100.00 · out ($30.00)');
	});

	it('counts in not the ticked rows’ net', async () => {
		mount({ rows: CONV });
		await fireEvent.click(screen.getByRole('checkbox', { name: /^Select Bitcoin/ }));
		await fireEvent.click(screen.getByRole('checkbox', { name: /^Select Rent/ }));
		expect(screen.getByRole('toolbar', { name: 'Act on the ticked rows' })).toHaveTextContent(
			'net $100.00'
		);
	});
});

describe('Ledger: its bar is the ListToolbar, and wide columns wait for width', () => {
	it('carries the module’s icon actions and its one labelled action after the Columns menu', () => {
		mount({
			tools: [{ label: 'Download as CSV', icon: Download }],
			action: { label: 'Add', icon: Plus }
		});
		const bar = screen.getByRole('toolbar', { name: 'This ledger' });
		const names = [...bar.querySelectorAll('button, a')].map(
			(el) => el.getAttribute('aria-label') ?? el.textContent?.trim()
		);
		expect(names).toEqual(['Columns, balance and grouping', 'Download as CSV', 'Add']);
		expect(within(bar).getByRole('heading', { name: 'Transactions' })).toBeInTheDocument();
	});

	it('ticks a wide-only column on a wide ledger and not on a narrow one', () => {
		const columns: LedgerColumn<Row>[] = [
			...COLUMNS,
			{ key: 'dwelling', label: 'Dwelling', on: 'wide', text: () => 'House' }
		];
		const narrow = mount({ columns, layout: 'narrow' });
		expect(narrow.heads()).not.toContain('Dwelling');
		narrow.unmount();
		const wide = mount({ columns, layout: 'wide' });
		expect(wide.heads()).toContain('Dwelling');
	});
});

describe('Ledger: a column’s actions', () => {
	it.each(['narrow', 'phone'] as const)('draws a title column’s actions on each row on a %s list', (layout) => {
		render(Harness, { props: { rows: ROWS, layout, withActions: true } });
		expect(screen.getAllByRole('button', { name: /^Only / })).toHaveLength(ROWS.length);
	});

	it('acts without opening the row', async () => {
		const { container } = render(Harness, { props: { rows: ROWS, withActions: true } });
		await fireEvent.click(screen.getByRole('button', { name: 'Only Ray White' }));
		expect(container.querySelector('[data-probe="acted"]')!.textContent).toBe('only Ray White');
		expect(container.querySelector('[data-probe="open"]')!.textContent).toBe('');
	});
});
