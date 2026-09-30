/**
 * The `sparkline` primitive.
 *
 * The claim a render-only check cannot make: the drawn line actually tracks
 * the series' own values, not a shape frozen at mount. The last point's
 * coordinates are hand-derived from the component's own normalisation
 * formula (`vals` scaled against `max(vals) * 1.12`) using a series whose
 * LAST value is not its max, so a component that quietly always drew a
 * corner (0 or max) would fail this rather than pass by coincidence. `cx`/
 * `cy`/`viewBox` are read as literal SVG attribute strings, which jsdom
 * returns verbatim with no CSS resolution involved.
 */
import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import SparklineHarness from './sparkline.svelte';

const WIDTH = 100;
const HEIGHT = 20;
const PAD = 8;

function gridLines(): HTMLElement[] {
	return Array.from(document.querySelectorAll('svg path[stroke="var(--ds-color-border)"]'));
}

function seriesCircles(): HTMLElement[] {
	return Array.from(document.querySelectorAll('svg circle'));
}

describe('Sparkline draws a fixed quarter grid regardless of data', () => {
	it('always draws exactly 3 grid lines', () => {
		render(SparklineHarness, {
			props: { series: [{ vals: [1, 2, 3], color: '#000' }], width: WIDTH, height: HEIGHT, pad: PAD }
		});
		expect(gridLines()).toHaveLength(3);
	});
});

describe('Sparkline tracks the series values, not a shape frozen at mount', () => {
	it('lands the last point where the normalised data says, for a value that is not the series max', () => {
		// last value (4) is not max(vals) (10), so a hardcoded corner would fail this.
		render(SparklineHarness, {
			props: { series: [{ vals: [0, 10, 4], color: '#22c55e' }], width: WIDTH, height: HEIGHT, pad: PAD }
		});
		const circle = seriesCircles()[0];
		expect(circle.getAttribute('cx')).toBe('92.0');
		expect(circle.getAttribute('cy')).toBe('10.6');
		expect(circle.getAttribute('fill')).toBe('#22c55e');
	});

	it('moves the last point when the underlying data changes', () => {
		render(SparklineHarness, {
			props: { series: [{ vals: [0, 10, 4], color: '#000' }], width: WIDTH, height: HEIGHT, pad: PAD }
		});
		const first = seriesCircles()[0].getAttribute('cy');
		cleanup();

		render(SparklineHarness, {
			props: { series: [{ vals: [0, 10, 9], color: '#000' }], width: WIDTH, height: HEIGHT, pad: PAD }
		});
		const second = seriesCircles()[0].getAttribute('cy');

		expect(second).not.toBe(first);
	});

	it('draws one point per series, each in its own colour, independently of the others', () => {
		render(SparklineHarness, {
			props: {
				series: [
					{ vals: [0, 10, 4], color: '#22c55e' },
					{ vals: [0, 5, 5], color: '#f97316' }
				],
				width: WIDTH,
				height: HEIGHT,
				pad: PAD
			}
		});
		const circles = seriesCircles();
		expect(circles).toHaveLength(2);
		expect(circles.map((c) => c.getAttribute('fill'))).toEqual(['#22c55e', '#f97316']);
		// The first series' last value (4) is not its own max (10): cy 10.6.
		expect(circles[0].getAttribute('cy')).toBe('10.6');
		// The second series' last value (5) IS its own max: the same 5/(5*1.12)
		// ratio as the first series would show at its own max, cy 8.4 — proving
		// each series normalises against its OWN data, not a shared scale.
		expect(circles[1].getAttribute('cy')).toBe('8.4');
	});
});

describe('Sparkline degenerate series', () => {
	// design-system#15 code review: a single-point or empty series divides by
	// zero in the width-spread ratio (i / (n - 1)), and an all-zero series
	// divides by zero in the value-range ratio — both real inputs (a
	// freshly-created lane, a metric that hasn't moved), not malformed ones.
	// The fix degrades to a flat/empty render; this pins that no NaN reaches
	// the DOM either way.
	it('renders a single-point series without NaN coordinates', () => {
		render(SparklineHarness, {
			props: { series: [{ vals: [7], color: '#22c55e' }], width: WIDTH, height: HEIGHT, pad: PAD }
		});
		const circle = seriesCircles()[0];
		expect(circle.getAttribute('cx')).not.toContain('NaN');
		expect(circle.getAttribute('cy')).not.toContain('NaN');
	});

	it('renders an empty series without NaN coordinates', () => {
		render(SparklineHarness, {
			props: { series: [{ vals: [], color: '#22c55e' }], width: WIDTH, height: HEIGHT, pad: PAD }
		});
		const circle = seriesCircles()[0];
		expect(circle.getAttribute('cx')).not.toContain('NaN');
		expect(circle.getAttribute('cy')).not.toContain('NaN');
	});

	it('renders an all-zero series without NaN coordinates', () => {
		render(SparklineHarness, {
			props: { series: [{ vals: [0, 0, 0], color: '#22c55e' }], width: WIDTH, height: HEIGHT, pad: PAD }
		});
		const circle = seriesCircles()[0];
		expect(circle.getAttribute('cx')).not.toContain('NaN');
		expect(circle.getAttribute('cy')).not.toContain('NaN');
	});
});

describe('Sparkline sizing', () => {
	it('sets the viewBox from width and height', () => {
		render(SparklineHarness, {
			props: { series: [{ vals: [1, 2], color: '#000' }], width: WIDTH, height: HEIGHT }
		});
		expect(document.querySelector('svg')).toHaveAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
	});

	it('fills the container width and holds a fixed pixel height', () => {
		render(SparklineHarness, {
			props: { series: [{ vals: [1, 2], color: '#000' }], width: WIDTH, height: HEIGHT }
		});
		const svg = document.querySelector('svg') as unknown as HTMLElement;
		expect(svg.style.display).toBe('block');
		expect(svg.style.width).toBe('100%');
		expect(svg.style.height).toBe(`${HEIGHT}px`);
	});
});
