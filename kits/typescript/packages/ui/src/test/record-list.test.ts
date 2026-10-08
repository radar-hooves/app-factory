/**
 * The RecordList: the ledger's look for rows that are not money. What the
 * look IS — the head card's columns on the rows', the cards and the ground —
 * is measured in a real engine (`harness/drive.mjs`, `?surface=records`).
 * What is held here is the behaviour: the title first and always, the
 * module's columns after it with the wide ones only on a wide list, the
 * viewer's choice emitted, groups in the order their rows come with their
 * totals, the sort, a row's flags, and how a row opens.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import Harness from './record-list.svelte';
import { orderBy } from '$lib/components/ui/ledger/ledger.js';
import type { RecordListRow } from '$lib/components/ui/record-list';

type Row = RecordListRow & { value: number; group?: string };

const ROWS: Row[] = [
	{ id: 3, title: '3. Ashgrove', note: '14 Ashgrove Street', value: 812000, group: 'Owned', image: '/a.jpg' },
	{
		id: 4,
		title: '4. Banksia',
		value: 575000,
		group: 'Owned',
		flags: [
			{ status: 'warning', label: 'No insurance since 12 Mar' },
			{ status: 'warning', label: 'No lease on the house' }
		]
	},
	{ id: 2, title: '2. Dorrigo', note: 'Sold Mar 2024', value: 430000, group: 'Sold' },
	{ id: 5, title: '5. Coolabah', value: 698000, group: 'Owned', flags: [{ status: 'warning', label: 'No lease on file' }] }
];

function mount(props: Partial<Parameters<typeof render<typeof Harness>>[1]> & Record<string, unknown> = {}) {
	const r = render(Harness, { props: { rows: ROWS, ...props } });
	const all = (sel: string) => [...r.container.querySelectorAll<HTMLElement>(sel)];
	const heads = () => all('[data-slot="record-head"] > *').map((s) => s.textContent?.trim());
	const titles = () => all('[data-slot="record-title"]').map((s) => s.textContent);
	const probe = (name: string) => r.container.querySelector(`[data-probe="${name}"]`)!.textContent;
	return { ...r, all, heads, titles, probe };
}

async function openColumns() {
	await fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
	return document.body.querySelector<HTMLElement>('[data-slot="record-columns"]')!;
}

describe('RecordList: the title, then the module’s columns', () => {
	it('heads the title column first, then the module’s, a wide-only column held back', () => {
		const { heads } = mount();
		expect(heads()).toEqual(['Property', 'Value']);
	});

	it('shows the wide-only column on a wide list', () => {
		const { heads } = mount({ layout: 'wide' });
		expect(heads()).toEqual(['Property', 'Value', 'Loan']);
	});

	it('keeps the rows in the order they came, one card when ungrouped', () => {
		const { titles, all } = mount();
		expect(titles()).toEqual(['3. Ashgrove', '4. Banksia', '2. Dorrigo', '5. Coolabah']);
		expect(all('[data-slot="record-card"]')).toHaveLength(1);
		expect(all('[data-slot="record-group"]')).toHaveLength(0);
	});

	it('counts the rows beside the title, in the module’s own noun', () => {
		mount();
		expect(screen.getByRole('toolbar', { name: 'Owned properties' })).toHaveTextContent('4 properties');
	});

	it('offers the module’s columns as ticks, the title locked, and emits the viewer’s choice', async () => {
		const { heads, probe } = mount();
		const menu = await openColumns();
		const labels = within(menu)
			.getAllByRole('checkbox')
			.map((c) => c.closest('label')!.textContent?.replace(/\s+/g, ' ').trim());
		expect(labels).toEqual(['Property Always shown', 'Value', 'Loan']);
		await fireEvent.click(within(menu).getByRole('checkbox', { name: 'Loan' }));
		expect(heads()).toEqual(['Property', 'Value', 'Loan']);
		expect(JSON.parse(probe('emitted')!)).toEqual([{ columns: ['value', 'loan'] }]);
		expect(within(menu).queryByText('Group by')).toBeNull();
	});

	it('has no bar without a title, and no Columns menu without heads', () => {
		const { all } = mount({ title: '', head: false });
		expect(all('[data-slot="list-toolbar"]')).toHaveLength(0);
		expect(all('[data-slot="record-head"]')).toHaveLength(0);
		expect(screen.queryByRole('button', { name: 'Columns' })).toBeNull();
	});
});

describe('RecordList: groups, on the ground, with their totals', () => {
	it('groups rows by label in the order their first rows come, each counted and totalled', () => {
		const { all } = mount({ grouped: true });
		const groups = all('[data-slot="record-group"]').map((g) => g.textContent?.replace(/\s+/g, ' ').trim());
		expect(groups).toEqual(['Owned 3 properties $2,085,000', 'Sold 1 property $430,000']);
		expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Owned', 'Sold']);
		expect(all('[data-slot="record-card"]')).toHaveLength(2);
	});

	it('adds a total card over every row when named', () => {
		const { all } = mount({ totalLabel: 'All four' });
		const cells = [...all('[data-slot="record-total"] > div > span')].map((c) => c.textContent?.trim());
		expect(cells).toEqual(['All four', '$2,515,000']);
	});
});

describe('RecordList: the viewer’s sort, inside each group', () => {
	const sortHead = (name: RegExp) => screen.getByRole('button', { name });

	it('sorts largest first, then reverses, then gives back the list’s own order', async () => {
		const { titles } = mount();
		await fireEvent.click(sortHead(/^Sort by Value/));
		expect(titles()).toEqual(['3. Ashgrove', '5. Coolabah', '4. Banksia', '2. Dorrigo']);
		await fireEvent.click(sortHead(/^Sorted by Value, descending/));
		expect(titles()).toEqual(['2. Dorrigo', '4. Banksia', '5. Coolabah', '3. Ashgrove']);
		await fireEvent.click(sortHead(/^Sorted by Value, ascending/));
		expect(titles()).toEqual(['3. Ashgrove', '4. Banksia', '2. Dorrigo', '5. Coolabah']);
	});

	it('sorts words from A first, then reverses, then gives back the list’s order', async () => {
		const { titles } = mount();
		await fireEvent.click(sortHead(/^Sort by Property/));
		expect(titles()).toEqual(['2. Dorrigo', '3. Ashgrove', '4. Banksia', '5. Coolabah']);
		await fireEvent.click(sortHead(/^Sorted by Property, ascending\. Click to reverse/));
		expect(titles()).toEqual(['5. Coolabah', '4. Banksia', '3. Ashgrove', '2. Dorrigo']);
		await fireEvent.click(sortHead(/^Sorted by Property, descending\. Click for the default order/));
		expect(titles()).toEqual(['3. Ashgrove', '4. Banksia', '2. Dorrigo', '5. Coolabah']);
	});

	it('sorts inside the groups, never across them', async () => {
		const { titles } = mount({ grouped: true });
		await fireEvent.click(sortHead(/^Sort by Value/));
		expect(titles()).toEqual(['3. Ashgrove', '5. Coolabah', '4. Banksia', '2. Dorrigo']);
	});

	it('sorts the title by its words, numerals as numbers', () => {
		expect(orderBy(['10. Z', '9. Y', '1. X'], (t) => t, 1)).toEqual(['1. X', '9. Y', '10. Z']);
		expect(orderBy([{ v: null }, { v: 2 }, { v: 1 }], (r) => r.v, -1)).toEqual([{ v: 2 }, { v: 1 }, { v: null }]);
	});
});

describe('RecordList: a row’s second line', () => {
	it('shows the first flag as a chip and names the rest as "+N more", to a screen reader too', () => {
		const { all } = mount();
		const banksia = all('[data-slot="record-row"]')[1]!;
		expect(banksia).toHaveTextContent('No insurance since 12 Mar');
		expect([...banksia.querySelectorAll('.ds-chip')].map((c) => c.textContent?.trim())).toEqual([
			'No insurance since 12 Mar'
		]);
		const more = banksia.querySelector('[data-slot="record-more"]')!;
		expect(more.firstChild?.textContent).toBe('+1 more');
		expect(more).toHaveAttribute('title', 'No lease on the house');
		expect(more.querySelector('.sr-only')?.textContent).toBe(': No lease on the house');
	});

	it('shows every flag on a phone, with the first end-aligned column’s value by the title', () => {
		const { all } = mount({ layout: 'phone' });
		const banksia = all('[data-slot="record-row"]')[1]!;
		expect(banksia).toHaveTextContent('No lease on the house');
		expect(banksia).toHaveTextContent('$575,000');
		expect(all('[data-slot="record-head"]')).toHaveLength(0);
	});

	it('gives every row a thumbnail once the list has a tile: its photo, or the tile', () => {
		const { all } = mount({ tile: true });
		const thumbs = all('[data-slot="record-thumbnail"]');
		expect(thumbs).toHaveLength(4);
		expect(thumbs[0]!.querySelector('img')).toHaveAttribute('src', '/a.jpg');
		expect(thumbs[1]!.querySelector('svg')).not.toBeNull();
		expect(thumbs[0]).toHaveAttribute('aria-hidden', 'true');
	});
});

describe('RecordList: how a row opens', () => {
	it('is a link named by the row’s title when the module gives it somewhere to go', () => {
		mount({ linked: true });
		expect(screen.getByRole('link', { name: '4. Banksia' })).toHaveAttribute('href', '/property/4');
	});

	it('opens a detail beside the list, and marks the open row', async () => {
		mount({ opening: true });
		const button = screen.getByRole('button', { name: 'Open 5. Coolabah' });
		expect(button).not.toHaveAttribute('aria-current');
		await fireEvent.click(button);
		expect(screen.getByRole('button', { name: 'Open 5. Coolabah' })).toHaveAttribute('aria-current', 'true');
		expect(screen.getByRole('button', { name: 'Open 4. Banksia' })).not.toHaveAttribute('aria-current');
	});

	it('leaves a control in a module’s own cell its own', async () => {
		const { probe } = mount({ opening: true, withCell: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Run 3. Ashgrove' }));
		expect(probe('ran')).toBe('3');
	});

	it('says so when there are no rows', () => {
		mount({ rows: [] });
		expect(screen.getByText('No properties')).toBeInTheDocument();
	});
});

describe('list layout by the list’s own width', () => {
	it('keeps the narrow tracks for a list beside a ContextColumn at 1280px with the rail open', async () => {
		const { listLayout } = await import('$lib/components/ui/ledger/look.js');
		// 1280 window, 248px rail, 360px column: godswood measured 588px of list.
		expect(listLayout(588)).toBe('narrow');
		expect(listLayout(479)).toBe('phone');
		expect(listLayout(390)).toBe('phone');
		expect(listLayout(1200)).toBe('wide');
		expect(listLayout(0)).toBe('narrow');
	});
});
