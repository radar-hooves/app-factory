// <SearchResults> over a consumer-shaped ranked answer: titles, highlighted
// passages, source chips, relevance figures, and the two distinct empty
// states — before any search, and after one that matched nothing. The
// component is designed rather than extracted (#30), so this suite is the
// record of its contract.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SearchResults from '$lib/components/ui/search-results/search-results.svelte';
import type { LibrarySearchResult } from '$lib/components/ui/search-results';

const results: LibrarySearchResult[] = [
	{
		id: 'hit-1',
		title: 'Trust deed — Rivers Family Trust',
		snippet: [
			{ text: 'The trustee may amend the ' },
			{ text: 'vesting date', highlight: true },
			{ text: ' with the consent of the appointor.' }
		],
		score: 0.92,
		source: 'household-legal',
		meta: 'deed · 2019',
		badges: [{ status: 'success', label: 'Indexed' }]
	},
	{
		id: 'hit-2',
		title: 'Estate planning notes',
		snippet: 'Plain-text passage with no highlight segments at all.',
		score: 0.4,
		source: 'estate-planning'
	}
];

describe('SearchResults — the ranked answer', () => {
	it('renders a counted line naming the query, and every hit in rank order', () => {
		render(SearchResults, { results, query: 'vesting date', total: 12 });
		expect(screen.getByText(/results for “vesting date”/)).toBeInTheDocument();
		expect(screen.getByText('12')).toBeInTheDocument();

		const items = screen.getAllByRole('listitem');
		expect(items).toHaveLength(2);
		expect(items[0]).toHaveTextContent('Trust deed — Rivers Family Trust');
		expect(items[1]).toHaveTextContent('Estate planning notes');
	});

	it('marks exactly the highlighted segments, and leaves a plain snippet unmarked', () => {
		const { container } = render(SearchResults, { results, query: 'vesting date' });
		const marks = container.querySelectorAll('mark');
		expect(marks).toHaveLength(1);
		expect(marks[0]).toHaveTextContent('vesting date');
		expect(screen.getByText(/Plain-text passage/)).toBeInTheDocument();
	});

	it('renders the relevance as a labelled percentage, clamped to [0, 100]', () => {
		render(SearchResults, {
			results: [{ id: 'hit-3', title: 'Overshoot', score: 1.4 }],
			query: 'x'
		});
		const score = screen.getByText('100%');
		expect(score).toHaveAttribute('aria-label', 'Relevance 100 percent');
	});

	it('renders the source chip, meta line and mapped state per hit', () => {
		render(SearchResults, { results, query: 'vesting date' });
		expect(screen.getByText('household-legal')).toBeInTheDocument();
		expect(screen.getByText('deed · 2019')).toBeInTheDocument();
		expect(screen.getByText('Indexed')).toBeInTheDocument();
	});

	it('links each hit through the app’s own router', () => {
		render(SearchResults, {
			results,
			query: 'vesting date',
			resultHref: (hit: LibrarySearchResult) => `#/library/${hit.id}`
		});
		expect(screen.getByRole('link', { name: 'Trust deed — Rivers Family Trust' })).toHaveAttribute(
			'href',
			'#/library/hit-1'
		);
	});

	it('fires onOpen from a title button when no href is given', async () => {
		const onOpen = vi.fn();
		render(SearchResults, { results, query: 'vesting date', onOpen });
		await fireEvent.click(screen.getByRole('button', { name: 'Estate planning notes' }));
		expect(onOpen).toHaveBeenCalledWith(results[1]);
	});
});

describe('SearchResults — empty, loading, failed', () => {
	it('before any search it invites one', () => {
		render(SearchResults, { results: [] });
		expect(screen.getByText('Search the catalogue')).toBeInTheDocument();
	});

	it('a search that matched nothing names the query', () => {
		render(SearchResults, { results: [], query: 'unfindable' });
		expect(screen.getByText('No results for “unfindable”')).toBeInTheDocument();
	});

	it('loading announces politely', () => {
		render(SearchResults, { results: [], query: 'deed', loading: true });
		expect(screen.getByRole('status')).toBeInTheDocument();
	});

	it('a failed search interrupts, and Retry hands control back to the page', async () => {
		const onRetry = vi.fn();
		render(SearchResults, { results: [], query: 'deed', error: 'Search is unreachable.', onRetry });
		expect(screen.getByRole('alert')).toHaveTextContent('Search is unreachable.');
		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(onRetry).toHaveBeenCalled();
	});
});
