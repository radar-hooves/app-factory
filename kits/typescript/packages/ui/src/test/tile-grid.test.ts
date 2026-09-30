/**
 * The tile grid's DOM contract, in the environment that can fairly judge it.
 *
 * jsdom applies no stylesheet and has no layout engine, so it cannot see the
 * thing this component ultimately claims — that the row falls to one column
 * rather than overflowing at 360px. That is measured in a real browser. What a
 * jsdom test CAN hold, permanently, is the declaration the component emits: the
 * `auto-fill` track for a given `min`, the element the `tag` selects, and — the
 * load-bearing half — that the `min()` wrapper is present, since a bare
 * `minmax(16rem, 1fr)` is a silent regression that renders fine at every width
 * except the narrow end.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import TileGridHarness from './tile-grid.svelte';

/** The grid container the component renders. */
function grid(container: HTMLElement): HTMLElement {
	const el = container.querySelector<HTMLElement>('[data-slot="tile-grid"]');
	if (!el) throw new Error('the tile grid rendered no container');
	return el;
}

/** The emitted inline style string — the DOM contract, no CSS engine needed. */
function style(el: HTMLElement): string {
	return el.getAttribute('style') ?? '';
}

describe('TileGrid — the track declaration', () => {
	it('emits an auto-fill track at the default min and gap', () => {
		const el = grid(render(TileGridHarness).container);

		expect(style(el)).toContain(
			'grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr))'
		);
		expect(style(el)).toContain('gap: 0.75rem');
		expect(el.className).toContain('grid');
	});

	it('threads a custom min into the track', () => {
		const el = grid(render(TileGridHarness, { props: { min: '12rem' } }).container);

		expect(style(el)).toContain('minmax(min(12rem, 100%), 1fr)');
	});

	it('threads a custom gap through', () => {
		const el = grid(render(TileGridHarness, { props: { gap: '1rem' } }).container);

		expect(style(el)).toContain('gap: 1rem');
	});
});

describe('TileGrid — the min() guard', () => {
	// The property that silently regresses. A bare `minmax(16rem, 1fr)` renders
	// identically to the correct track at every width except the narrow end,
	// where the `min()` wrapper is the only thing letting the column collapse
	// below its minimum instead of overflowing the viewport. There is no visual
	// diff in jsdom to catch its loss, so it is asserted as a string.
	it('wraps the track minimum in min(…, 100%), never a bare length', () => {
		const el = grid(render(TileGridHarness).container);

		expect(style(el)).toContain('minmax(min(16rem, 100%)');
		expect(style(el)).not.toMatch(/minmax\(\s*16rem/);
	});
});

describe('TileGrid — the tag prop', () => {
	it('renders a div by default', () => {
		const el = grid(render(TileGridHarness).container);

		expect(el.tagName).toBe('DIV');
	});

	it('renders a ul when asked, keeping the list semantics an index needs', () => {
		const el = grid(render(TileGridHarness, { props: { tag: 'ul' } }).container);

		expect(el.tagName).toBe('UL');
		// The tiles are its list items, not swallowed into a wrapper.
		expect(el.querySelectorAll('li')).toHaveLength(2);
	});
});
