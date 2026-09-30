/**
 * The `arc-gauge` primitive.
 *
 * Two claims that a render-only check cannot make: the arc's `stroke-dashoffset`
 * actually tracks `pct` (a gauge stuck at its initial value would still render
 * fine), and `tone` resolves to the right status token rather than always
 * painting the default. Both are read as literal SVG presentation-attribute
 * strings, which jsdom returns unresolved but exact — no CSS/`var()` resolution
 * is needed to make either assertion.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ArcGaugeHarness from './arc-gauge.svelte';

const SIZE = 42;
const RADIUS = SIZE / 2 - 4;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function offsetFor(pct: number) {
	return CIRCUMFERENCE * (1 - pct / 100);
}

function circles(): HTMLElement[] {
	return Array.from(document.querySelectorAll('svg circle'));
}

/** The second circle is the fill arc; the first is the static track. */
function fillArc(): HTMLElement {
	return circles()[1];
}

describe('ArcGauge arc reflects the value', () => {
	it('draws a full offset (empty ring) at 0%', () => {
		render(ArcGaugeHarness, { props: { pct: 0 } });
		expect(Number(fillArc().getAttribute('stroke-dashoffset'))).toBeCloseTo(offsetFor(0), 5);
	});

	it('draws a zero offset (full ring) at 100%', () => {
		render(ArcGaugeHarness, { props: { pct: 100 } });
		expect(Number(fillArc().getAttribute('stroke-dashoffset'))).toBeCloseTo(offsetFor(100), 5);
	});

	it('tracks an intermediate value, not a value frozen at mount', () => {
		render(ArcGaugeHarness, { props: { pct: 37 } });
		expect(Number(fillArc().getAttribute('stroke-dashoffset'))).toBeCloseTo(offsetFor(37), 5);
	});

	it('clamps a value above 100', () => {
		render(ArcGaugeHarness, { props: { pct: 250 } });
		expect(Number(fillArc().getAttribute('stroke-dashoffset'))).toBeCloseTo(offsetFor(100), 5);
		expect(document.querySelector('svg')).toHaveAttribute('aria-label', '100% used');
	});

	it('clamps a value below 0', () => {
		render(ArcGaugeHarness, { props: { pct: -30 } });
		expect(Number(fillArc().getAttribute('stroke-dashoffset'))).toBeCloseTo(offsetFor(0), 5);
		expect(document.querySelector('svg')).toHaveAttribute('aria-label', '0% used');
	});
});

describe('ArcGauge tone maps to the status token, not always the default', () => {
	it.each([
		['success', 'var(--ds-color-status-success)'],
		['warning', 'var(--ds-color-status-warning)'],
		['error', 'var(--ds-color-status-error)']
	] as const)('paints %s as %s', (tone, expected) => {
		render(ArcGaugeHarness, { props: { pct: 50, tone } });
		expect(fillArc().getAttribute('stroke')).toBe(expected);
	});

	it('defaults to success when tone is omitted', () => {
		render(ArcGaugeHarness, { props: { pct: 50 } });
		expect(fillArc().getAttribute('stroke')).toBe('var(--ds-color-status-success)');
	});

	it('falls back to success for a runtime tone outside the typed union, rather than an unpainted stroke', () => {
		// `tone` is compile-time-closed to GaugeTone, but a caller deriving it
		// from an untyped API response can still hand in something else at
		// runtime; the map lookup must not silently resolve to `undefined`.
		render(ArcGaugeHarness, { props: { pct: 50, tone: 'not-a-real-tone' as never } });
		expect(fillArc().getAttribute('stroke')).toBe('var(--ds-color-status-success)');
	});
});

describe('ArcGauge label', () => {
	it('shows the percentage and unit label only at a big size with showLabel set', () => {
		render(ArcGaugeHarness, { props: { pct: 42, size: 42, showLabel: true, label: '5h' } });
		const texts = Array.from(document.querySelectorAll('svg text'));
		expect(texts.map((t) => t.textContent)).toEqual(['42%', '5H']);
	});

	it('renders no label text below the big-size threshold, even with showLabel set', () => {
		render(ArcGaugeHarness, { props: { pct: 42, size: 36, showLabel: true, label: '5h' } });
		expect(document.querySelectorAll('svg text').length).toBe(0);
	});

	it('renders no label text when showLabel is false', () => {
		render(ArcGaugeHarness, { props: { pct: 42, size: 42, showLabel: false } });
		expect(document.querySelectorAll('svg text').length).toBe(0);
	});
});
