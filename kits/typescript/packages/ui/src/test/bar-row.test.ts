/**
 * The `bar-row` primitive.
 *
 * The one claim a render-only check cannot make: the fill's `width` actually
 * tracks `pct`, clamped to the 0–100 range, rather than being frozen at
 * whatever the first render happened to pass. `width` is asserted from the
 * inline `style` attribute jsdom returns verbatim — no CSS resolution needed,
 * since it is never expressed as a token or a `var()`.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import BarRowHarness from './bar-row.svelte';

function fill(): HTMLElement {
	const el = document.querySelector('.grid > span:nth-child(2) > span');
	expect(el).not.toBeNull();
	return el as HTMLElement;
}

function track(): HTMLElement {
	const el = document.querySelector('.grid > span:nth-child(2)');
	expect(el).not.toBeNull();
	return el as HTMLElement;
}

describe('BarRow renders its label and value', () => {
	it('shows the label text and a string value', () => {
		render(BarRowHarness, { props: { label: 'Lane A', value: '42%', pct: 42 } });
		expect(screen.getByText('Lane A')).toBeInTheDocument();
		expect(screen.getByText('42%')).toBeInTheDocument();
	});

	it('coerces a numeric value to text', () => {
		render(BarRowHarness, { props: { label: 'Lane B', value: 7, pct: 10 } });
		expect(screen.getByText('7')).toBeInTheDocument();
	});
});

describe('BarRow fill tracks pct, not a value frozen at mount', () => {
	it('fills to the given percentage', () => {
		render(BarRowHarness, { props: { label: 'row', value: 'v', pct: 63 } });
		expect(fill().style.width).toBe('63%');
	});

	it('clamps a value above 100', () => {
		render(BarRowHarness, { props: { label: 'row', value: 'v', pct: 140 } });
		expect(fill().style.width).toBe('100%');
	});

	it('clamps a value below 0', () => {
		render(BarRowHarness, { props: { label: 'row', value: 'v', pct: -20 } });
		expect(fill().style.width).toBe('0%');
	});

	it('defaults the fill colour to the primary token', () => {
		render(BarRowHarness, { props: { label: 'row', value: 'v', pct: 50 } });
		expect(fill().style.background).toBe('var(--ds-color-primary)');
	});

	it('uses a caller-supplied colour instead of the default', () => {
		render(BarRowHarness, { props: { label: 'row', value: 'v', pct: 50, color: '#22c55e' } });
		expect(fill().style.background).toBe('rgb(34, 197, 94)');
	});
});

describe('BarRow label column width', () => {
	it('defaults the grid template to 8.5rem for the label column', () => {
		render(BarRowHarness, { props: { label: 'row', value: 'v', pct: 50 } });
		expect(track().parentElement?.getAttribute('style')).toContain('grid-template-columns: 8.5rem 1fr 2.6rem');
	});

	it('honours a caller-supplied labelWidth', () => {
		render(BarRowHarness, { props: { label: 'row', value: 'v', pct: 50, labelWidth: '12rem' } });
		expect(track().parentElement?.getAttribute('style')).toContain('grid-template-columns: 12rem 1fr 2.6rem');
	});
});
