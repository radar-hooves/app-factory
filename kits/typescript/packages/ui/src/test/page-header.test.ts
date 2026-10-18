/**
 * Behaviour proof for PageHeader's `breadcrumbs`: an array renders the
 * package's Breadcrumbs landmark, a snippet renders the caller's own markup
 * with no landmark from the package, and an empty array renders no trail.
 *
 * Not asserted: spacing and wrap. jsdom has no layout.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PageHeader from '$lib/components/ui/page-header/page-header.svelte';
import SnippetHeader from './page-header-breadcrumbs.svelte';

describe('PageHeader — breadcrumbs', () => {
	it('carries data-slot="page-header" on its root', () => {
		const { container } = render(PageHeader, { props: { title: 'Setup' } });
		expect(container.firstElementChild).toHaveAttribute('data-slot', 'page-header');
	});

	it('renders an array as the Breadcrumbs landmark', () => {
		render(PageHeader, {
			props: {
				title: 'Setup',
				breadcrumbs: [{ label: 'Library', href: '/library' }, { label: 'Setup' }]
			}
		});
		const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
		expect(nav).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library');
		expect(screen.getByRole('heading', { level: 1, name: 'Setup' })).toBeInTheDocument();
	});

	it('still renders a snippet, with no Breadcrumb landmark from the package', () => {
		render(SnippetHeader);
		expect(screen.getByRole('link', { name: 'Own trail' })).toHaveAttribute('href', '/own');
		expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
	});

	it('renders no trail for an empty array', () => {
		render(PageHeader, { props: { title: 'Setup', breadcrumbs: [] } });
		expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
	});
});
