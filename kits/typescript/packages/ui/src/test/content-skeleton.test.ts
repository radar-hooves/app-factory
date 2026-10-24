/**
 * Behaviour proof for ContentSkeleton: a polite, busy status whose accessible
 * text is its label, bars hidden from assistive technology, and a default row
 * count the caller can override.
 *
 * Not asserted: bar widths, the tile grid's column steps (container queries)
 * or the shimmer. jsdom has no layout. Only the rows shape has a countable
 * container without reaching for class names, so `tiles` and `prose` are
 * proved by `data-shape`, the status contract and hidden bars.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ContentSkeleton from '$lib/components/ui/content-skeleton/content-skeleton.svelte';

const hiddenBlock = () => document.querySelector('[data-slot="content-skeleton"] > [aria-hidden]');

describe('ContentSkeleton', () => {
	it('is a busy status named by its label', () => {
		render(ContentSkeleton, { props: { label: 'Loading invoices…' } });
		const status = screen.getByRole('status');
		expect(status).toHaveAttribute('aria-busy', 'true');
		expect(status).toHaveTextContent('Loading invoices…');
	});

	it('says "Loading…" when given no label', () => {
		render(ContentSkeleton);
		expect(screen.getByRole('status')).toHaveTextContent('Loading…');
	});

	it('keeps the label out of sight, for a screen reader only', () => {
		render(ContentSkeleton, { props: { label: 'Loading invoices…' } });
		expect(screen.getByText('Loading invoices…')).toHaveClass('sr-only');
	});

	it('hides its bars from assistive technology, so only the label is announced', () => {
		render(ContentSkeleton);
		const block = hiddenBlock();
		expect(block).toHaveAttribute('aria-hidden', 'true');
		expect(block?.children.length).toBeGreaterThan(0);
	});

	it('draws 5 rows by default, and reflects the shape', () => {
		render(ContentSkeleton);
		expect(screen.getByRole('status')).toHaveAttribute('data-shape', 'rows');
		expect(hiddenBlock()?.children).toHaveLength(5);
	});

	it('draws `count` rows when given one', () => {
		render(ContentSkeleton, { props: { count: 2 } });
		expect(hiddenBlock()?.children).toHaveLength(2);
	});

	it('renders the tiles shape', () => {
		render(ContentSkeleton, { props: { shape: 'tiles' } });
		expect(screen.getByRole('status')).toHaveAttribute('data-shape', 'tiles');
		expect(hiddenBlock()).toHaveAttribute('aria-hidden', 'true');
	});

	it('renders the prose shape', () => {
		render(ContentSkeleton, { props: { shape: 'prose' } });
		expect(screen.getByRole('status')).toHaveAttribute('data-shape', 'prose');
		expect(hiddenBlock()).toHaveAttribute('aria-hidden', 'true');
		// The page type caps the line; the skeleton only says it is prose.
		expect(hiddenBlock()).toHaveAttribute('data-prose');
	});
});
