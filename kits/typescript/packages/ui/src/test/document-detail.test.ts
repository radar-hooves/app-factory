// <DocumentDetail> over a consumer-shaped document payload: the identity
// fields, locations, tags and memberships, each section present exactly when
// its data is — an empty heading over nothing is the drift this fixed shape
// exists to end.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DocumentDetail from '$lib/components/ui/document-detail/document-detail.svelte';
import type { LibraryDocumentDetail, LibraryMembership } from '$lib/components/ui/document-detail';

const doc: LibraryDocumentDetail = {
	id: 'doc-1',
	title: 'Trust deed — Rivers Family Trust',
	fields: [
		{ label: 'Content hash', value: 'a3f81c92d4e5', mono: true },
		{ label: 'Type', value: 'deed' },
		{ label: 'Catalogued', value: '14/02/2026' }
	],
	tags: ['legal', 'trust'],
	locations: [
		{ path: '/vault/legal/trust-deed.pdf', primary: true },
		{ path: '/archive/2019/trust-deed.pdf', badge: { status: 'warning', label: 'Missing' } }
	],
	memberships: [
		{ id: 'col-7', name: 'household-legal', badge: { status: 'success', label: 'Indexed' } },
		{ id: 'col-9', name: 'estate-planning', badge: { status: 'info', label: 'Pending' } }
	]
};

describe('DocumentDetail — the entity surface', () => {
	it('renders the title, eyebrow and every field row', () => {
		render(DocumentDetail, { document: doc });
		expect(screen.getByText('Trust deed — Rivers Family Trust')).toBeInTheDocument();
		expect(screen.getByText('Document')).toBeInTheDocument();
		expect(screen.getByText('Content hash')).toBeInTheDocument();
		expect(screen.getByText('a3f81c92d4e5')).toBeInTheDocument();
		expect(screen.getByText('14/02/2026')).toBeInTheDocument();
	});

	it('sets a machine value in the code face and a plain value not', () => {
		render(DocumentDetail, { document: doc });
		expect(screen.getByText('a3f81c92d4e5')).toHaveClass('font-mono');
		expect(screen.getByText('deed')).not.toHaveClass('font-mono');
	});

	it('renders locations with the primary marker and any mapped state', () => {
		render(DocumentDetail, { document: doc });
		expect(screen.getByText('/vault/legal/trust-deed.pdf')).toBeInTheDocument();
		expect(screen.getByText('primary')).toBeInTheDocument();
		expect(screen.getByText('Missing')).toBeInTheDocument();
	});

	it('renders each tag once', () => {
		render(DocumentDetail, { document: doc });
		expect(screen.getByText('legal')).toBeInTheDocument();
		expect(screen.getByText('trust')).toBeInTheDocument();
	});

	it('links each membership through the app’s own router', () => {
		render(DocumentDetail, {
			document: doc,
			collectionHref: (m: LibraryMembership) => `#/collections/${m.id}`
		});
		const link = screen.getByRole('link', { name: /household-legal/ });
		expect(link).toHaveAttribute('href', '#/collections/col-7');
	});

	it('fires onOpenCollection from a button when no href is given', async () => {
		const onOpenCollection = vi.fn();
		render(DocumentDetail, { document: doc, onOpenCollection });
		await fireEvent.click(screen.getByRole('button', { name: /estate-planning/ }));
		expect(onOpenCollection).toHaveBeenCalledWith(doc.memberships?.[1]);
	});

	it('omits a section whose data is absent, heading and all', () => {
		render(DocumentDetail, {
			document: { id: 'doc-2', title: 'Bare document', fields: [{ label: 'Type', value: 'note' }] }
		});
		expect(screen.queryByText('Locations')).not.toBeInTheDocument();
		expect(screen.queryByText('Tags')).not.toBeInTheDocument();
		expect(screen.queryByText('Collections')).not.toBeInTheDocument();
	});
});

describe('DocumentDetail — empty, loading, failed', () => {
	it('loading announces politely and renders no panel', () => {
		render(DocumentDetail, { document: doc, loading: true });
		expect(screen.getByRole('status')).toBeInTheDocument();
		expect(screen.queryByText('Trust deed — Rivers Family Trust')).not.toBeInTheDocument();
	});

	it('a failed load interrupts, and Retry hands control back to the page', async () => {
		const onRetry = vi.fn();
		render(DocumentDetail, { document: null, error: 'Not reachable.', onRetry });
		expect(screen.getByRole('alert')).toHaveTextContent('Not reachable.');
		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(onRetry).toHaveBeenCalled();
	});

	it('a document that does not exist reads as not found', () => {
		render(DocumentDetail, { document: null });
		expect(screen.getByText('Document not found')).toBeInTheDocument();
		expect(screen.getByText('This document is not in the catalogue.')).toBeInTheDocument();
	});
});

describe('DocumentDetail — a 390px screen', () => {
	// A grid or flex item defaults to min-width:auto, so it grows to its widest
	// child and `truncate` can never shrink it. Without these the content hash
	// pushed every VALUE off the side and left the labels alone on screen.
	it('lets every long value shrink instead of stretching the card', () => {
		render(DocumentDetail, { document: doc });

		const label = screen.getByText('Content hash');
		expect(label.className).toContain('shrink-0');

		const value = label.parentElement?.querySelector('dd');
		expect(value?.className).toContain('min-w-0');
		expect(value?.className).toContain('truncate');
		expect(value).toHaveAttribute('title');
	});
});
