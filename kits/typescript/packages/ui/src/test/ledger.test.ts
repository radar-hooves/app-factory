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
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import Harness from './ledger.svelte';
import {
	fySpan,
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
		all('[data-slot="ledger-head"] > span:not(:first-child)').map((s) => s.textContent?.trim());
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

	it('shows one review dot, only on the row that needs one', () => {
		const { all } = mount();
		const dots = all('[data-slot="ledger-review"]');
		expect(dots).toHaveLength(1);
		expect(dots[0]!.closest('[data-slot="ledger-row"]')!.textContent).toContain('Ray White');
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
		expect(heads()).toEqual(['Date', 'Payee', 'Amount', 'Category']);
	});

	it('offers every column as a tick, the three fixed ones locked and the balance last', async () => {
		mount();
		const menu = await openColumns();
		const labels = within(menu)
			.getAllByRole('checkbox')
			.map((c) => c.closest('label')!.textContent?.replace(/\s+/g, ' ').trim());
		expect(labels).toEqual([
			'Date Always shown',
			'Payee Always shown',
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
		expect(heads()).toEqual(['Date', 'Payee', 'Amount', 'Category', 'Balance']);
		expect(JSON.parse(probe('emitted'))).toEqual({
			columns: ['category', 'balance'],
			period: 'month'
		});

		await fireEvent.click(within(menu).getAllByRole('checkbox')[4]!);
		expect(heads()).toEqual(['Date', 'Payee', 'Amount', 'Category', 'Labels', 'Balance']);
	});

	it('takes the consumer’s kept columns, and ignores one it no longer offers', () => {
		const { heads } = mount({ preferences: { columns: ['balance', 'gone'] } });
		expect(heads()).toEqual(['Date', 'Payee', 'Amount', 'Balance']);
	});

	it('resets to the module’s defaults', async () => {
		const { heads, probe } = mount({ preferences: { columns: ['balance'], period: 'day' } });
		const menu = await openColumns();
		await fireEvent.click(within(menu).getByRole('button', { name: 'Reset' }));
		expect(heads()).toEqual(['Date', 'Payee', 'Amount', 'Category']);
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
		expect(heads()).toEqual(['Payee', 'Amount', 'Category']);
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
		// The review dot still has its place at the row's left edge.
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
