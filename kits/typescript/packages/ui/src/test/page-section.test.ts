/**
 * Behaviour proof for PageSection: a region named by its own heading, a
 * heading level the caller chooses, and heading ids that never collide.
 *
 * Not asserted: the type step between h2 and h3, or the header's alignment.
 * jsdom applies no stylesheet and has no layout.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import PageSection from '$lib/components/ui/page-section/page-section.svelte';
import Harness from './page-section.svelte';

describe('PageSection', () => {
	it('is a region whose accessible name is its heading', () => {
		render(Harness);
		expect(screen.getByRole('region', { name: 'Recent' })).toBeInTheDocument();
	});

	it('carries data-slot="page-section"', () => {
		render(Harness);
		expect(screen.getByRole('region', { name: 'Recent' })).toHaveAttribute(
			'data-slot',
			'page-section'
		);
	});

	it('defaults to an h2', () => {
		render(Harness);
		expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Recent');
	});

	it('renders an h3 for level 3', () => {
		render(Harness, { props: { level: 3 } });
		expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Recent');
		expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
	});

	it('renders the count beside the title, inside the heading', () => {
		render(Harness, { props: { count: 7 } });
		const heading = screen.getByRole('heading', { level: 2 });
		expect(within(heading).getByText('Recent')).toBeInTheDocument();
		expect(within(heading).getByText('7')).toBeInTheDocument();
	});

	it('renders the description, the actions and the body', () => {
		render(Harness);
		expect(screen.getByText('What came in lately.')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Add one' })).toBeInTheDocument();
		expect(screen.getByText('Body text')).toBeInTheDocument();
	});

	it('uses a given id as the heading id', () => {
		render(Harness, { props: { id: 'recent-docs' } });
		expect(screen.getByRole('heading', { level: 2 })).toHaveAttribute('id', 'recent-docs');
		expect(screen.getByRole('region', { name: 'Recent' })).toHaveAttribute(
			'aria-labelledby',
			'recent-docs'
		);
	});

	it('gives two sections distinct generated heading ids', () => {
		render(PageSection, { props: { title: 'One' } });
		render(PageSection, { props: { title: 'Two' } });
		const [a, b] = screen.getAllByRole('heading');
		expect(a.id).toBeTruthy();
		expect(b.id).toBeTruthy();
		expect(a.id).not.toBe(b.id);
		expect(screen.getByRole('region', { name: 'One' })).toBeInTheDocument();
		expect(screen.getByRole('region', { name: 'Two' })).toBeInTheDocument();
	});
});
