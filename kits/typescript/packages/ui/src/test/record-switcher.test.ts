/**
 * The RecordSwitcher: the open record's whole name as the bar's control, a
 * menu that finds, groups and pictures every record and ends on all of them,
 * and the record's own pages as tabs. The trigger's look against the board is
 * measured in `harness/drive.mjs` (`?surface=record`).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/svelte';
import House from '@lucide/svelte/icons/house';
import RecordSwitcher from '$lib/components/ui/record-switcher';
import type { RecordSwitcherGroup } from '$lib/components/ui/record-switcher';

const GROUPS: RecordSwitcherGroup[] = [
	{
		label: 'Owned',
		items: [
			{ id: 3, label: '3. Ashgrove', note: 'Kenmore · $812,000', href: '/property/3', image: '/a.jpg' },
			{ id: 4, label: '4. Banksia', note: 'Tarragindi · $575,000', href: '/property/4' }
		]
	},
	{ label: 'Sold', items: [{ id: 1, label: '1. Eumundi', note: 'sold Nov 2021', href: '/property/1' }] }
];

function mount(props: Record<string, unknown> = {}) {
	return render(RecordSwitcher, {
		props: {
			name: '4. Banksia',
			current: 4,
			groups: GROUPS,
			noun: 'property',
			icon: House,
			all: { label: 'All properties', href: '/property' },
			...props
		}
	});
}

async function openMenu() {
	mount();
	await fireEvent.click(screen.getByRole('button', { name: '4. Banksia: switch to another property' }));
	return screen.getByRole('combobox', { name: 'Find a property' }).closest<HTMLElement>('[data-slot="command"]')!;
}

const items = (menu: HTMLElement) =>
	[...menu.querySelectorAll<HTMLElement>('[data-slot="record-switcher-item"]')].filter(
		(el) => !el.hidden && el.style.display !== 'none'
	);

describe('RecordSwitcher', () => {
	it('is the record’s whole name, after the section’s, with its chevron inside', () => {
		const { container } = mount();
		const trigger = screen.getByRole('button', { name: '4. Banksia: switch to another property' });
		expect(trigger).toHaveTextContent('4. Banksia');
		expect(trigger.querySelector('svg')).not.toBeNull();
		expect(container.textContent?.trim().startsWith('/')).toBe(true);
	});

	it('drops the separator where it is not in the bar', () => {
		const { container } = mount({ separator: false });
		expect(container.textContent?.includes('/')).toBe(false);
	});

	it('lists every record as a link under its heading, a thumbnail each, the open one marked', async () => {
		const menu = await openMenu();
		expect(within(menu).getByText('Owned')).toBeInTheDocument();
		expect(within(menu).getByText('Sold')).toBeInTheDocument();
		const links = items(menu);
		expect(links.map((a) => a.getAttribute('href'))).toEqual(['/property/3', '/property/4', '/property/1']);
		expect(links.map((a) => a.querySelector('[data-slot="record-thumbnail"]') !== null)).toEqual([true, true, true]);
		expect(links[0]!.querySelector('img')).toHaveAttribute('src', '/a.jpg');
		expect(links[1]).toHaveAttribute('aria-current', 'page');
		expect(links[0]).not.toHaveAttribute('aria-current');
	});

	it('opens with the open record highlighted, not the first', async () => {
		const menu = await openMenu();
		const highlighted = menu.querySelector('[data-slot="record-switcher-item"][aria-selected="true"]');
		expect(highlighted).toHaveTextContent('4. Banksia');
	});

	it('ends on every record, on its list', async () => {
		const menu = await openMenu();
		expect(within(menu).getByRole('link', { name: 'All properties' })).toHaveAttribute('href', '/property');
	});

	it('finds a record by its name', async () => {
		const menu = await openMenu();
		await fireEvent.input(screen.getByRole('combobox', { name: 'Find a property' }), {
			target: { value: 'eumundi' }
		});
		await new Promise((r) => setTimeout(r, 0));
		expect(items(menu).map((a) => a.getAttribute('href'))).toEqual(['/property/1']);
	});

	it('searches names and notes, never the menu’s own keys', async () => {
		const menu = await openMenu();
		await fireEvent.input(screen.getByRole('combobox', { name: 'Find a property' }), {
			target: { value: 'record' }
		});
		await new Promise((r) => setTimeout(r, 0));
		expect(items(menu)).toHaveLength(0);
		expect(within(menu).getByText('No property by that name')).toBeInTheDocument();
	});

	it('says which record is open to a screen reader', async () => {
		const menu = await openMenu();
		expect(items(menu)[1]).toHaveTextContent(', open now');
	});

	it('carries the record’s pages as tabs, the one open marked', () => {
		mount({
			pages: [
				{ label: 'Overview', href: '/property/4', current: true },
				{ label: 'Ledger', href: '/property/4/ledger' }
			]
		});
		const nav = screen.getByRole('navigation', { name: 'Pages of 4. Banksia' });
		expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
		expect(within(nav).getByRole('link', { name: 'Ledger' })).not.toHaveAttribute('aria-current');
	});

	it('lets the tabs scroll inside the row and hides the breadcrumb on a phone', () => {
		const { container } = mount({
			pages: [
				{ label: 'Overview', href: '/property/4', current: true },
				{ label: 'Ledger', href: '/property/4/ledger' }
			]
		});
		const nav = screen.getByRole('navigation', { name: 'Pages of 4. Banksia' });
		expect(nav).toHaveClass('min-w-0', 'overflow-x-auto');
		expect(within(nav).getByRole('link', { name: 'Ledger' })).toHaveClass('flex-none');
		expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('max-sm:hidden');
	});

	describe('a strip with tabs past its edge', () => {
		const sizes = { clientWidth: 100, scrollWidth: 300 };
		const saved = Object.fromEntries(
			Object.keys(sizes).map((k) => [k, Object.getOwnPropertyDescriptor(HTMLElement.prototype, k)])
		);
		beforeEach(() => {
			for (const [k, v] of Object.entries(sizes))
				Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: () => v });
		});
		afterEach(() => {
			for (const k of Object.keys(sizes)) {
				if (saved[k]) Object.defineProperty(HTMLElement.prototype, k, saved[k]!);
				else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
			}
		});

		it('fades the edge that has more, and says so, so a hidden tab is not silent', async () => {
			mount({
				pages: [
					{ label: 'Overview', href: '/property/4', current: true },
					{ label: 'Ledger', href: '/property/4/ledger' }
				]
			});
			const nav = screen.getByRole('navigation', { name: 'Pages of 4. Banksia' });
			await waitFor(() => expect(nav).toHaveAttribute('data-more-after'));
			expect(nav).not.toHaveAttribute('data-more-before');
			expect(nav.style.getPropertyValue('--fade-end')).toBe('1.5rem');
			expect(nav.style.getPropertyValue('--fade-start')).toBe('0px');
			nav.scrollLeft = 200;
			await fireEvent.scroll(nav);
			expect(nav).toHaveAttribute('data-more-before');
			expect(nav).not.toHaveAttribute('data-more-after');
		});

		it('scrolls the open page into view when it lies past the right edge', () => {
			Object.defineProperty(HTMLElement.prototype, 'offsetLeft', { configurable: true, get: () => 250 });
			Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 40 });
			try {
				mount({
					pages: [
						{ label: 'Overview', href: '/property/4' },
						{ label: 'P&L', href: '/property/4?tab=pnl', current: true }
					]
				});
				const nav = screen.getByRole('navigation', { name: 'Pages of 4. Banksia' });
				// The open tab's right edge is 290 and the strip shows 100: scrolled to bring it in.
				expect(nav.scrollLeft).toBe(190);
			} finally {
				delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetLeft;
				delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
			}
		});
	});
});
