/**
 * Behaviour proof for PageContainer: it renders its children inside a root
 * that declares itself by `data-slot`.
 *
 * Not asserted: the column's gap, or that a child PageHeader loses its bottom
 * margin. Those are CSS and need a real browser.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Harness from './page-container.svelte';

describe('PageContainer', () => {
	it('renders its children', () => {
		render(Harness);
		expect(screen.getByText('Inside the page')).toBeInTheDocument();
	});

	it('carries data-slot="page-container" on the element holding the children', () => {
		render(Harness);
		const root = document.querySelector('[data-slot="page-container"]');
		expect(root).not.toBeNull();
		expect(root).toContainElement(screen.getByText('Inside the page'));
	});
});
