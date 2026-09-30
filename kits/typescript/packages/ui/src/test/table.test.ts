/**
 * `Table`'s two class seams.
 *
 * The table and its scroll container are different boxes and only one of them
 * can be told to be shorter. A sticky header needs a bounded, scrolling
 * ancestor, and `class` lands on the `<table>` — so an app wanting one had to
 * reach in from the outside with `[&>[data-slot=table-container]]:max-h-…`,
 * an arbitrary-variant selector aimed at a structure this package is free to
 * change without warning. That is a private detail in use as public API.
 *
 * `containerClass` names the seam. The tests below assert the two classes land
 * on DIFFERENT elements and neither knocks out the other's base classes, which
 * is the whole substance of the change — a `containerClass` that silently
 * merged into `class` would look identical at the call site and do nothing.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import TableHarness from './table.svelte';

function container(): HTMLElement {
	const el = document.querySelector('[data-slot="table-container"]');
	expect(el).not.toBeNull();
	return el as HTMLElement;
}

function table(): HTMLElement {
	const el = document.querySelector('table[data-slot="table"]');
	expect(el).not.toBeNull();
	return el as HTMLElement;
}

describe('Table class seams', () => {
	it('puts containerClass on the scroll container, not on the table', () => {
		render(TableHarness);

		expect(container().className).toContain('max-h-64');
		expect(container().className).toContain('rounded-lg');
		expect(table().className).not.toContain('max-h-64');
	});

	it('puts class on the table, not on the container', () => {
		render(TableHarness);

		expect(table().className).toContain('table-fixed');
		expect(container().className).not.toContain('table-fixed');
	});

	it('keeps the container’s own scrolling behaviour', () => {
		render(TableHarness);

		// The reason this goes through `cn` rather than string concatenation: a
		// caller capping the height must not be able to take `overflow-x-auto`
		// with it, or a wide table stops scrolling and starts overflowing — the
		// exact class of defect #5 was about.
		expect(container().className).toContain('overflow-x-auto');
		expect(container().className).toContain('relative');
		expect(container().className).toContain('w-full');
	});

	it('renders the container as the table’s parent, so a cap actually bounds it', () => {
		render(TableHarness);
		expect(table().parentElement).toBe(container());
	});
});
