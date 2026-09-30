// <CollectionDetail> over a consumer-shaped collection payload: identity,
// stats, the documents it holds, and the independent load states of the
// identity and the list — the two arrive from different requests in every
// consumer, so their states must not be welded together.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CollectionDetail from '$lib/components/ui/collection-detail/collection-detail.svelte';
import type { LibraryCollection, LibraryDocument } from '$lib/components/ui/collection-detail';

const collection: LibraryCollection = {
	id: 'col-7',
	name: 'household-legal',
	subtitle: 'estate · text · active',
	description: 'Deeds, agreements and notices for the household entities.',
	badge: { status: 'success', label: 'Healthy' }
};

const documents: LibraryDocument[] = [
	{
		id: 'doc-1',
		title: 'Trust deed — Rivers Family Trust',
		badges: [{ status: 'success', label: 'Indexed' }]
	},
	{ id: 'doc-2', title: 'Lease agreement 2026', badges: [{ status: 'error', label: 'Failed' }] }
];

describe('CollectionDetail — identity', () => {
	it('renders the name, meta line, description and mapped state', () => {
		render(CollectionDetail, { collection, documents });
		expect(screen.getByText('household-legal')).toBeInTheDocument();
		expect(screen.getByText('estate · text · active')).toBeInTheDocument();
		expect(screen.getByText(/Deeds, agreements and notices/)).toBeInTheDocument();
		expect(screen.getByText('Healthy')).toBeInTheDocument();
		expect(screen.getByText('Collection')).toBeInTheDocument();
	});

	it('renders the at-a-glance stats it is given', () => {
		render(CollectionDetail, {
			collection,
			documents,
			stats: [
				{ label: 'Documents', value: 2 },
				{ label: 'Failed', value: 1, status: 'error' }
			]
		});
		expect(screen.getByText('Documents', { selector: 'dt' })).toBeInTheDocument();
		expect(screen.getByText('2', { selector: 'dd *' })).toBeInTheDocument();
	});
});

describe('CollectionDetail — the documents it holds', () => {
	it('renders the table under a counted panel and hands the pager offset back', async () => {
		const onPageChange = vi.fn();
		render(CollectionDetail, {
			collection,
			documents,
			documentsTotal: 40,
			offset: 0,
			limit: 20,
			onPageChange
		});
		expect(screen.getByText('40 documents')).toBeInTheDocument();
		expect(screen.getByText('Trust deed — Rivers Family Trust')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
		await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		expect(onPageChange).toHaveBeenCalledWith(20);
	});

	it('links each row through the app’s own router', () => {
		render(CollectionDetail, {
			collection,
			documents,
			documentHref: (doc: LibraryDocument) => `#/library/${doc.id}`
		});
		expect(screen.getByRole('link', { name: 'Lease agreement 2026' })).toHaveAttribute(
			'href',
			'#/library/doc-2'
		);
	});

	it('an empty collection says so without a table', () => {
		render(CollectionDetail, { collection, documents: [] });
		expect(screen.getByText('No documents in this collection yet')).toBeInTheDocument();
		expect(screen.queryByRole('table')).not.toBeInTheDocument();
	});

	it('the list can load or fail while the identity stands', () => {
		const { unmount } = render(CollectionDetail, {
			collection,
			documents: [],
			documentsLoading: true
		});
		expect(screen.getByText('household-legal')).toBeInTheDocument();
		expect(screen.getByRole('status')).toBeInTheDocument();
		unmount();

		render(CollectionDetail, {
			collection,
			documents: [],
			documentsError: 'The document list is unreachable.'
		});
		expect(screen.getByText('household-legal')).toBeInTheDocument();
		expect(screen.getByRole('alert')).toHaveTextContent('The document list is unreachable.');
	});
});

describe('CollectionDetail — empty, loading, failed', () => {
	it('loading announces politely and renders no identity', () => {
		render(CollectionDetail, { collection, loading: true });
		expect(screen.getByRole('status')).toBeInTheDocument();
		expect(screen.queryByText('household-legal')).not.toBeInTheDocument();
	});

	it('a failed load interrupts, and Retry hands control back to the page', async () => {
		const onRetry = vi.fn();
		render(CollectionDetail, { collection: null, error: 'Not reachable.', onRetry });
		expect(screen.getByRole('alert')).toHaveTextContent('Not reachable.');
		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(onRetry).toHaveBeenCalled();
	});

	it('a collection that does not exist reads as not found', () => {
		render(CollectionDetail, { collection: null });
		expect(screen.getByText('Collection not found')).toBeInTheDocument();
	});
});
