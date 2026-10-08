/**
 * A column's `cell` gets the row and the column. One markup snippet serves
 * columns built at runtime, and follows the row when its figures change; a
 * `createRawSnippet` cell draws once at mount (a Svelte property, so it stays
 * stale: the first test pins that, and why consumers use the markup form).
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Harness from './cell-reactive.svelte';

const row = (total: number, other: number) => ({ id: 'Income:Rent', title: 'Rent', total, other });

describe('ListColumn.cell', () => {
	it('keeps a markup cell on the row’s new figures and tells columns apart by key', async () => {
		const { container, rerender } = render(Harness, { props: { rows: [row(100, 7)] } });
		const text = (p: string) => container.querySelector(`[data-probe="${p}"]`)?.textContent;
		expect([text('total'), text('other')]).toEqual(['100', '7']);
		await rerender({ rows: [row(250, 9)] });
		expect([text('total'), text('other')]).toEqual(['250', '9']);
		expect(text('raw')).toBe('100');
	});
});
