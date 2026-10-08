/**
 * ContextColumn's record form and the DocumentPane beside it. A record page's
 * column holds the one item the page opened, which a click swaps and a close
 * sends back to what needs the viewer; its document takes the column's place,
 * and stands beside it once the page's row has room for three panes. That the item scrolls inside
 * itself and the third pane shares the row is layout, measured in a real
 * engine (`harness/drive.mjs`, `?surface=record`).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import Download from '@lucide/svelte/icons/download';
import Harness from './context-column-record.svelte';
import DocumentPane from '$lib/components/ui/document-pane';

const original = window.ResizeObserver;
afterEach(() => {
	window.ResizeObserver = original;
});

/** A page row `px` wide, as the column's observer reads it. */
function rowWidth(px: number) {
	window.ResizeObserver = class {
		constructor(private callback: ResizeObserverCallback) {}
		observe(target: Element) {
			this.callback([{ target, contentRect: { width: px } } as ResizeObserverEntry], this);
		}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const column = () => document.querySelector<HTMLElement>('aside[data-slot="context-column"]')!;
const beside = () => document.querySelector<HTMLElement>('[data-slot="context-column-document"]');

describe('ContextColumn: a record page’s opened item', () => {
	it('holds the opened item under its title and why it was opened, named by it', () => {
		render(Harness);
		const aside = screen.getByRole('complementary', { name: 'Tenancy' });
		expect(within(aside).getByRole('heading', { name: 'Tenancy' })).toBeInTheDocument();
		expect(aside).toHaveTextContent('Opened on what needs you');
		expect(within(aside).getByText('Tenancy body')).toBeInTheDocument();
		expect(aside.querySelector('[data-slot="stat-list"], dl')).toBeNull();
	});

	it('swaps the item when the page opens another', async () => {
		render(Harness);
		await fireEvent.click(screen.getByRole('button', { name: 'Insurance' }));
		const aside = screen.getByRole('complementary', { name: 'Insurance' });
		expect(within(aside).getByText('Insurance body')).toBeInTheDocument();
		expect(aside).not.toHaveTextContent('Tenancy');
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

	it('puts the document in the column’s place in a row with no room for three panes', async () => {
		rowWidth(1100);
		render(Harness);
		await fireEvent.click(screen.getByRole('button', { name: 'Open the lease' }));
		expect(within(column()).getByRole('heading', { name: 'Residential tenancy agreement' })).toBeInTheDocument();
		expect(within(column()).queryByText('Tenancy body')).toBeNull();
		expect(beside()).toBeNull();
	});

	it('stands the document beside the column once the row has room, 1250px of it', async () => {
		rowWidth(1250);
		render(Harness);
		await fireEvent.click(screen.getByRole('button', { name: 'Open the lease' }));
		expect(within(column()).getByText('Tenancy body')).toBeInTheDocument();
		expect(within(beside()!).getByRole('heading', { name: 'Residential tenancy agreement' })).toBeInTheDocument();
	});

	it('gives the column back to the item when the document closes', async () => {
		rowWidth(1100);
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
		expect(screen.getByText('2 / 3')).toBeInTheDocument();
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
