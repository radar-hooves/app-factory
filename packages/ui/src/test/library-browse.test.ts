// <LibraryBrowse> over consumer-shaped catalogue payloads: rows, facets,
// chips, the pager, and the three non-happy states. Every assertion is about
// the DOM a consumer's user sees, and every callback is asserted with the
// exact next state the page is expected to re-query with — the component owns
// no state of its own, so the callbacks ARE its behaviour.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import LibraryBrowse from '$lib/components/ui/library-browse/library-browse.svelte';
import type { LibraryDocument, LibraryFacet } from '$lib/components/ui/library-browse';

const documents: LibraryDocument[] = [
	{
		id: 'doc-1',
		title: 'Trust deed — Rivers Family Trust',
		tags: ['legal', 'trust'],
		collections: ['legal'],
		badges: [{ status: 'success', label: 'Indexed' }]
	},
	{
		id: 'doc-2',
		title: 'Rates notice 2026',
		tags: ['property'],
		collections: ['property'],
		badges: [{ status: 'info', label: 'Pending' }]
	}
];

const facets: LibraryFacet[] = [
	{
		key: 'tag',
		label: 'Tags',
		multiple: true,
		selected: ['legal'],
		options: [
			{ value: 'legal', count: 4 },
			{ value: 'property', count: 2 }
		]
	},
	{
		key: 'year',
		label: 'Year',
		selected: [],
		options: [{ value: '2026', count: 6 }]
	}
];

describe('LibraryBrowse — the catalogue', () => {
	it('renders a row per document with its tags, collections and badges', () => {
		render(LibraryBrowse, { documents });

		expect(screen.getByText('Trust deed — Rivers Family Trust')).toBeInTheDocument();
		expect(screen.getByText('Rates notice 2026')).toBeInTheDocument();
		expect(screen.getByText('legal, trust')).toBeInTheDocument();
		expect(screen.getByText('Indexed')).toBeInTheDocument();
		expect(screen.getByText('Pending')).toBeInTheDocument();
	});

	it('drops a column no document carries, rather than rendering it empty', () => {
		render(LibraryBrowse, {
			documents: [{ id: 'doc-1', title: 'Bare document' }]
		});
		expect(screen.queryByText('Tags', { selector: 'th' })).not.toBeInTheDocument();
		expect(screen.queryByText('Collections', { selector: 'th' })).not.toBeInTheDocument();
		expect(screen.queryByText('Status', { selector: 'th' })).not.toBeInTheDocument();
	});

	it('renders each title as the app’s own routed link when documentHref is given', () => {
		render(LibraryBrowse, {
			documents,
			documentHref: (doc: LibraryDocument) => `#/library/${doc.id}`
		});
		expect(screen.getByRole('link', { name: 'Trust deed — Rivers Family Trust' })).toHaveAttribute(
			'href',
			'#/library/doc-1'
		);
	});

	it('fires onOpenDocument from a title button when no href is given', async () => {
		const onOpenDocument = vi.fn();
		render(LibraryBrowse, { documents, onOpenDocument });
		await fireEvent.click(screen.getByRole('button', { name: 'Rates notice 2026' }));
		expect(onOpenDocument).toHaveBeenCalledWith(documents[1]);
	});

	it('hands every keystroke to the page through onQueryChange', async () => {
		const onQueryChange = vi.fn();
		render(LibraryBrowse, { documents, onQueryChange });
		await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'deed' } });
		expect(onQueryChange).toHaveBeenCalledWith('deed');
	});

	it('toggles a multiple facet by adding to the selection', async () => {
		const onFacetChange = vi.fn();
		render(LibraryBrowse, { documents, facets, onFacetChange });
		await fireEvent.click(screen.getByRole('button', { name: /property 2/ }));
		expect(onFacetChange).toHaveBeenCalledWith('tag', ['legal', 'property']);
	});

	it('toggles a single facet by replacing the selection', async () => {
		const onFacetChange = vi.fn();
		render(LibraryBrowse, { documents, facets, onFacetChange });
		await fireEvent.click(screen.getByRole('button', { name: /2026 6/ }));
		expect(onFacetChange).toHaveBeenCalledWith('year', ['2026']);
	});

	it('marks a selected facet option pressed', () => {
		render(LibraryBrowse, { documents, facets });
		expect(screen.getByRole('button', { name: /legal 4/ })).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: /property 2/ })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
	});

	it('renders a chip per active filter, and removing one hands back the selection without it', async () => {
		const onFacetChange = vi.fn();
		const onQueryChange = vi.fn();
		render(LibraryBrowse, { documents, facets, query: 'deed', onFacetChange, onQueryChange });

		expect(screen.getByText('“deed”')).toBeInTheDocument();
		expect(screen.getByText('tags: legal')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Remove filter tags: legal' }));
		expect(onFacetChange).toHaveBeenCalledWith('tag', []);

		await fireEvent.click(screen.getByRole('button', { name: 'Remove filter “deed”' }));
		expect(onQueryChange).toHaveBeenCalledWith('');
	});

	it('Clear all clears the query and every selected facet, and nothing else', async () => {
		const onFacetChange = vi.fn();
		const onQueryChange = vi.fn();
		render(LibraryBrowse, { documents, facets, query: 'deed', onFacetChange, onQueryChange });
		await fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
		expect(onQueryChange).toHaveBeenCalledWith('');
		expect(onFacetChange).toHaveBeenCalledTimes(1);
		expect(onFacetChange).toHaveBeenCalledWith('tag', []);
	});
});

describe('LibraryBrowse — the pager', () => {
	it('reports the page it is on and hands the next offset to the page', async () => {
		const onPageChange = vi.fn();
		render(LibraryBrowse, { documents, total: 60, offset: 25, limit: 25, onPageChange });

		expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
		expect(screen.getByText('60 documents')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
		expect(onPageChange).toHaveBeenCalledWith(0);
		await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
		expect(onPageChange).toHaveBeenCalledWith(50);
	});

	it('disables the edge it is already at', () => {
		render(LibraryBrowse, { documents, total: 30, offset: 25, limit: 25, onPageChange: vi.fn() });
		expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
		expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
	});

	it('renders no pager when everything fits one page', () => {
		render(LibraryBrowse, { documents, total: 2, limit: 25, onPageChange: vi.fn() });
		expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
	});
});

describe('LibraryBrowse — empty, loading, failed', () => {
	it('loading announces politely and shows no table', () => {
		render(LibraryBrowse, { documents: [], loading: true });
		expect(screen.getByRole('status')).toBeInTheDocument();
		expect(screen.queryByRole('table')).not.toBeInTheDocument();
	});

	it('a failed load interrupts, and Retry hands control back to the page', async () => {
		const onRetry = vi.fn();
		render(LibraryBrowse, { documents: [], error: 'The catalogue is unreachable.', onRetry });
		expect(screen.getByRole('alert')).toHaveTextContent('The catalogue is unreachable.');
		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(onRetry).toHaveBeenCalled();
	});

	it('an empty catalogue and an empty search read differently', async () => {
		const onQueryChange = vi.fn();
		const first = render(LibraryBrowse, { documents: [] });
		expect(screen.getByText('The catalogue is empty')).toBeInTheDocument();
		first.unmount();

		render(LibraryBrowse, { documents: [], query: 'deed', onQueryChange });
		expect(screen.getByText('No documents match this search')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
		expect(onQueryChange).toHaveBeenCalledWith('');
	});
});

describe('LibraryBrowse — reachable on a phone', () => {
	// The rail used to be `hidden md:block` with nothing to reveal it, so below
	// md the whole of filtering was absent — the drawer is what makes a facet
	// reachable at 390px rather than merely present in the DOM.
	it('offers a Filters disclosure only when there are facets to disclose', () => {
		const bare = render(LibraryBrowse, { documents });
		expect(screen.queryByRole('button', { name: /Filters/ })).not.toBeInTheDocument();
		bare.unmount();

		render(LibraryBrowse, { documents, facets });
		expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
	});

	it('the disclosure reveals the rail and says which state it is in', async () => {
		render(LibraryBrowse, { documents, facets });
		const trigger = screen.getByRole('button', { name: 'Filters' });
		const rail = screen.getByLabelText('Filters', { selector: 'aside' });

		expect(trigger).toHaveAttribute('aria-expanded', 'false');
		expect(rail.className).toContain('hidden');

		await fireEvent.click(trigger);
		expect(screen.getByRole('button', { name: 'Hide filters' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
		expect(rail.className).not.toContain('hidden');
	});
});

describe('DocumentTable — a phone-width catalogue', () => {
	it('drops the secondary columns by breakpoint and truncates the title', () => {
		render(LibraryBrowse, { documents, documentHref: (doc) => `/library/${doc.id}` });

		// Tags below xl and Collections below lg are the two columns a phone has
		// no room for; Title and Status stay at every width.
		expect(screen.getByRole('columnheader', { name: 'Tags' }).className).toContain('xl:table-cell');
		expect(screen.getByRole('columnheader', { name: 'Collections' }).className).toContain(
			'lg:table-cell'
		);
		expect(screen.getByRole('columnheader', { name: 'Status' }).className).not.toContain('hidden');

		// max-w-0 + truncate together: TableCell sets whitespace-nowrap, so a
		// bound with no truncate overflows under the next cell and swallows the
		// link's clicks, and truncate with no bound never shrinks at all.
		const link = screen.getByRole('link', { name: 'Trust deed — Rivers Family Trust' });
		expect(link.className).toContain('truncate');
		expect(link.closest('td')?.className).toContain('max-w-0');
		expect(link).toHaveAttribute('title', 'Trust deed — Rivers Family Trust');
	});
});
