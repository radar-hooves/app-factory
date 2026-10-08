/**
 * The bar above every list: its title and count, its icon actions named by
 * their tooltips, and its one labelled action. The Ledger and the RecordList
 * draw theirs with it, so what is held here holds for both.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Download from '@lucide/svelte/icons/download';
import Plus from '@lucide/svelte/icons/plus';
import Harness from './list-toolbar.svelte';

const order = () =>
	[...screen.getByRole('toolbar').querySelectorAll('h2, button, a')].map(
		(el) => el.getAttribute('aria-label') ?? el.textContent?.trim()
	);

describe('ListToolbar', () => {
	it('names itself by its title, which is a heading, with the count beside it', () => {
		render(Harness, { props: { title: 'Owned properties', meta: '3 properties' } });
		const bar = screen.getByRole('toolbar', { name: 'Owned properties' });
		expect(screen.getByRole('heading', { level: 2, name: 'Owned properties' })).toBeInTheDocument();
		expect(bar).toHaveTextContent('3 properties');
	});

	it('takes a name of its own where the title would not stand alone', () => {
		render(Harness, { props: { title: 'Transactions', label: 'This ledger' } });
		expect(screen.getByRole('toolbar', { name: 'This ledger' })).toBeInTheDocument();
	});

	it('draws an icon action as a button named by its label, and runs it', async () => {
		const onclick = vi.fn();
		render(Harness, { props: { title: 'T', tools: [{ label: 'Download as CSV', icon: Download, onclick }] } });
		const button = screen.getByRole('button', { name: 'Download as CSV' });
		expect(button.querySelector('svg')).not.toBeNull();
		expect(button).not.toHaveTextContent('Download as CSV');
		await fireEvent.click(button);
		expect(onclick).toHaveBeenCalledOnce();
	});

	it('draws an icon action with an href as a link, saving it when asked', () => {
		render(Harness, {
			props: {
				title: 'T',
				tools: [{ label: 'Download', icon: Download, href: '/export.csv', download: 'export.csv' }]
			}
		});
		const link = screen.getByRole('link', { name: 'Download' });
		expect(link).toHaveAttribute('href', '/export.csv');
		expect(link).toHaveAttribute('download', 'export.csv');
	});

	it('draws the one labelled action with its words, last', async () => {
		const onclick = vi.fn();
		render(Harness, {
			props: {
				title: 'Owned properties',
				tools: [{ label: 'Download as CSV', icon: Download }],
				action: { label: 'Add property', icon: Plus, onclick },
				withLeading: true,
				withControl: true
			}
		});
		expect(order()).toEqual([
			'By property',
			'Owned properties',
			'Columns',
			'Download as CSV',
			'Add property'
		]);
		await fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
		expect(onclick).toHaveBeenCalledOnce();
	});

	it('draws a labelled action with an href as a link', () => {
		render(Harness, { props: { title: 'T', action: { label: 'Add manager', href: '/managers/new' } } });
		expect(screen.getByRole('link', { name: 'Add manager' })).toHaveAttribute('href', '/managers/new');
	});

	it('renders nothing it was not given', () => {
		render(Harness, { props: { title: 'Tools' } });
		expect(screen.queryAllByRole('button')).toHaveLength(0);
		expect(screen.queryAllByRole('link')).toHaveLength(0);
	});
});
