/**
 * ContextColumn's record form and the DocumentPane beside it. A record page's
 * column holds the one item the page opened, which a click swaps and a close
 * sends back to what needs the viewer; its document takes the item's place.
 * The column is the page's aside: it renders in `aside.ds-page-aside` on a tool
 * page and opens from the bar below 80rem. Where it stands and that the item
 * scrolls inside itself is layout, measured in a real engine
 * (`harness/drive.mjs`, `?surface=record`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import Download from '@lucide/svelte/icons/download';
import Harness from './context-column-record.svelte';
import DocumentPane from '$lib/components/ui/document-pane';
import { windowWidth } from './window-width.js';

beforeEach(() => windowWidth(100));

const aside = () => document.querySelector<HTMLElement>('aside.ds-page-aside')!;
const column = () => aside().querySelector<HTMLElement>('[data-slot="context-column"]')!;

describe('ContextColumn: a record page’s opened item', () => {
	it('holds the opened item under its title and why it was opened, named by it', () => {
		render(Harness);
		const region = screen.getByRole('complementary', { name: 'Tenancy' });
		expect(region).toBe(aside());
		expect(within(region).getByRole('heading', { name: 'Tenancy' })).toBeInTheDocument();
		expect(region).toHaveTextContent('Opened on what needs you');
		expect(within(region).getByText('Tenancy body')).toBeInTheDocument();
		expect(region.querySelector('[data-slot="stat-list"], dl')).toBeNull();
	});

	it('swaps the item when the page opens another', async () => {
		render(Harness);
		await fireEvent.click(screen.getByRole('button', { name: 'Insurance' }));
		const region = screen.getByRole('complementary', { name: 'Insurance' });
		expect(within(region).getByText('Insurance body')).toBeInTheDocument();
		expect(region).not.toHaveTextContent('Tenancy');
	});

	it('closes back to what the page opens first, never to nothing', async () => {
		render(Harness);
		await fireEvent.click(screen.getByRole('button', { name: 'Insurance' }));
		await fireEvent.click(within(column()).getByRole('button', { name: 'Close Insurance' }));
		expect(screen.getByRole('complementary', { name: 'Tenancy' })).toHaveTextContent('Tenancy body');
	});

	it('scrolls the item’s body inside its card, under a header that stays', () => {
		render(Harness);
		const body = column().querySelector('[data-slot="panel-body"]')!;
		expect(body.className).toContain('overflow-y-auto');
		expect(body.className).toContain('min-h-0');
	});

	it('puts the document in the item’s place, never beside the column as a third pane', async () => {
		render(Harness);
		await fireEvent.click(screen.getByRole('button', { name: 'Open the lease' }));
		expect(within(column()).getByRole('heading', { name: 'Residential tenancy agreement' })).toBeInTheDocument();
		expect(within(column()).queryByText('Tenancy body')).toBeNull();
		expect(document.querySelector('[data-slot="context-column-document"]')).toBeNull();
	});

	it('gives the column back to the item when the document closes', async () => {
		render(Harness, { props: { withDocument: true } });
		await fireEvent.click(
			within(column()).getByRole('button', { name: 'Close Residential tenancy agreement' })
		);
		expect(within(column()).getByText('Tenancy body')).toBeInTheDocument();
	});
});

describe('DocumentPane', () => {
	const PAGES = ['/p1.png', '/p2.png', '/p3.png'];

	it('titles the document, says what it is of, and offers its actions and a close', async () => {
		const onClose = vi.fn();
		render(DocumentPane, {
			props: {
				title: 'Residential tenancy agreement',
				subtitle: 'House · 19 Jul 2025 to 18 Jan 2026',
				pages: PAGES,
				actions: [{ label: 'Download', icon: Download, href: '/lease.pdf', download: true }],
				onClose
			}
		});
		const pane = screen.getByRole('region', { name: 'Residential tenancy agreement' });
		expect(pane).toHaveTextContent('House · 19 Jul 2025 to 18 Jan 2026');
		expect(within(pane).getByRole('link', { name: 'Download' })).toHaveAttribute('href', '/lease.pdf');
		await fireEvent.click(within(pane).getByRole('button', { name: 'Close Residential tenancy agreement' }));
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('shows one page at a time, and pages through them', async () => {
		render(DocumentPane, { props: { title: 'Lease', pages: PAGES } });
		expect(screen.getByRole('img', { name: 'Lease, page 1 of 3' })).toHaveAttribute('src', '/p1.png');
		await fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		expect(screen.getByRole('img', { name: 'Lease, page 2 of 3' })).toHaveAttribute('src', '/p2.png');
		expect(screen.getByText('2 of 3')).toBeInTheDocument();
	});

	it('says which page failed to load, and still pages past it', async () => {
		render(DocumentPane, { props: { title: 'Lease', pages: PAGES } });
		await fireEvent.error(screen.getByRole('img', { name: 'Lease, page 1 of 3' }));
		expect(screen.getByText('Page 1 could not be loaded')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		expect(screen.getByRole('img', { name: 'Lease, page 2 of 3' })).toBeInTheDocument();
	});

	it('opens a document swapped into it on its first page, with nothing failed', async () => {
		const { rerender } = render(DocumentPane, { props: { title: 'Lease A', pages: PAGES } });
		await fireEvent.error(screen.getByRole('img', { name: 'Lease A, page 1 of 3' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		expect(screen.getByRole('img', { name: 'Lease A, page 3 of 3' })).toBeInTheDocument();
		await rerender({ title: 'Lease B', pages: ['/b1.png', '/b2.png'] });
		expect(screen.getByRole('img', { name: 'Lease B, page 1 of 2' })).toHaveAttribute('src', '/b1.png');
		expect(screen.queryByText(/could not be loaded/)).toBeNull();
	});

	it('has no close where nothing closes it', () => {
		render(DocumentPane, { props: { title: 'Lease', pages: PAGES } });
		expect(screen.queryByRole('button', { name: /^Close/ })).toBeNull();
	});
});

describe('ContextColumn: below 80rem', () => {
	beforeEach(() => windowWidth(70));

	it('leaves the page with no aside and no floating opener, the bar holding the button', () => {
		render(Harness);
		expect(document.querySelector('aside.ds-page-aside')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Open Tenancy' })).toBeNull();
		expect(screen.getByTestId('ds-page-aside-open')).toHaveAccessibleName('Tenancy');
	});

	it('opens a record on its body, the sheet’s title being the item’s name', async () => {
		render(Harness);
		await fireEvent.click(screen.getByTestId('ds-page-aside-open'));
		const dialog = await screen.findByRole('dialog');
		expect(within(dialog).getAllByRole('heading', { name: 'Tenancy' })).toHaveLength(1);
		expect(within(dialog).getByText('Tenancy body')).toBeInTheDocument();
	});

	// The sheet's head names the column, so what the body's own heading carried
	// beneath it (a record's subtitle, the stat card's info) goes there too.
	it('keeps the record’s subtitle in the sheet', async () => {
		render(Harness);
		await fireEvent.click(screen.getByTestId('ds-page-aside-open'));
		const dialog = await screen.findByRole('dialog');
		expect(within(dialog).getByText('Opened on what needs you')).toBeInTheDocument();
	});

	it('opens a list page’s stats under one At a glance', async () => {
		render(Harness, { props: { list: true } });
		await fireEvent.click(screen.getByTestId('ds-page-aside-open'));
		const dialog = await screen.findByRole('dialog');
		expect(within(dialog).getAllByRole('heading', { name: 'At a glance' })).toHaveLength(1);
		expect(within(dialog).getByText('Value')).toBeInTheDocument();
	});

	it('keeps the stat card’s info tip beside the name in the sheet', async () => {
		render(Harness, { props: { list: true } });
		await fireEvent.click(screen.getByTestId('ds-page-aside-open'));
		const dialog = await screen.findByRole('dialog');
		expect(
			within(dialog.querySelector('[data-slot="sheet-header"]')!).getByText('Held today.')
		).toBeInTheDocument();
	});

	it('keeps the stat card’s own title when the sheet is named otherwise', async () => {
		render(Harness, { props: { list: true, ariaLabel: 'Property context' } });
		await fireEvent.click(screen.getByTestId('ds-page-aside-open'));
		const dialog = await screen.findByRole('dialog');
		expect(within(dialog).getByRole('heading', { name: 'At a glance' })).toBeInTheDocument();
	});

	it('keeps the record item’s own title and close when the sheet is named otherwise', async () => {
		render(Harness, { props: { ariaLabel: 'Property context' } });
		await fireEvent.click(screen.getByTestId('ds-page-aside-open'));
		const dialog = await screen.findByRole('dialog');
		expect(within(dialog).getByRole('heading', { name: 'Tenancy' })).toBeInTheDocument();
		expect(within(dialog).getByRole('button', { name: 'Close Tenancy' })).toBeInTheDocument();
	});
});
