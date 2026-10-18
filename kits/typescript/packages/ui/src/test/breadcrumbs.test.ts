/**
 * Behaviour proof for Breadcrumbs: a named navigation landmark holding an
 * ordered list, links only where a step has an href, and `aria-current` only
 * on the final step.
 *
 * Not asserted: truncation, the ancestor width ceiling or the chevron's look.
 * jsdom has no layout, so those are real-browser claims.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Breadcrumbs from '$lib/components/ui/breadcrumbs/breadcrumbs.svelte';

const items = [
	{ label: 'Library', href: '/library' },
	{ label: 'Guides' },
	{ label: 'Setup' }
];

describe('Breadcrumbs — the trail', () => {
	it('is a navigation landmark named "Breadcrumb" by default', () => {
		render(Breadcrumbs, { props: { items } });
		expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
	});

	it('takes a custom landmark name', () => {
		render(Breadcrumbs, { props: { items, label: 'You are here' } });
		expect(screen.getByRole('navigation', { name: 'You are here' })).toBeInTheDocument();
		expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
	});

	it('lists one item per step in an ordered list', () => {
		render(Breadcrumbs, { props: { items } });
		const list = screen.getByRole('list');
		expect(list.tagName).toBe('OL');
		expect(screen.getAllByRole('listitem').map((li) => li.textContent?.trim())).toEqual([
			'Library',
			'Guides',
			'Setup'
		]);
	});

	it('links a step that has an href, to that href', () => {
		render(Breadcrumbs, { props: { items } });
		expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library');
	});

	it('marks the last step, when it has no href, as the current page', () => {
		render(Breadcrumbs, { props: { items } });
		expect(screen.getByText('Setup')).toHaveAttribute('aria-current', 'page');
		expect(screen.queryByRole('link', { name: 'Setup' })).not.toBeInTheDocument();
	});

	it('leaves an ancestor without an href as plain text with no aria-current', () => {
		render(Breadcrumbs, { props: { items } });
		const ancestor = screen.getByText('Guides');
		expect(ancestor).not.toHaveAttribute('aria-current');
		expect(screen.queryByRole('link', { name: 'Guides' })).not.toBeInTheDocument();
	});

	it('does not mark a linked last step as current: a link is a way back, not a place', () => {
		const linked = [
			{ label: 'A', href: '/a' },
			{ label: 'B', href: '/b' }
		];
		render(Breadcrumbs, { props: { items: linked } });
		expect(document.querySelector('[aria-current]')).toBeNull();
	});

	it('hides every separator from assistive technology', () => {
		render(Breadcrumbs, { props: { items } });
		const separators = document.querySelectorAll('li svg');
		expect(separators).toHaveLength(2);
		for (const s of separators) expect(s).toHaveAttribute('aria-hidden', 'true');
	});
});
