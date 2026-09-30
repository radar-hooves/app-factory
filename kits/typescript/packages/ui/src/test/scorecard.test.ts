/**
 * The `scorecard` primitive: a dot per 0/1/2 health check.
 *
 * The claim that matters is that each dot's colour class actually follows its
 * own score — a fixed row of identically-styled dots would render fine and
 * say nothing. Reuses the package's own `.ds-dot`/`.ds-dot-{status}` classes
 * (StatCard, StatList) rather than a private colour scale, so this is also a
 * regression guard on that reuse.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ScorecardHarness from './scorecard.svelte';

function dots(): HTMLElement[] {
	return Array.from(document.querySelectorAll('[role="img"] i'));
}

describe('Scorecard renders one dot per score, coloured by its own value', () => {
	it('renders an off/error dot for 0', () => {
		render(ScorecardHarness, { props: { scores: [0] } });
		expect(dots()).toHaveLength(1);
		expect(dots()[0].className).toContain('ds-dot-error');
	});

	it('renders an on/success dot for 1', () => {
		render(ScorecardHarness, { props: { scores: [1] } });
		expect(dots()[0].className).toContain('ds-dot-success');
	});

	it('renders a warn dot for 2', () => {
		render(ScorecardHarness, { props: { scores: [2] } });
		expect(dots()[0].className).toContain('ds-dot-warning');
	});

	it('renders each dot independently across a mixed row, in order', () => {
		render(ScorecardHarness, { props: { scores: [0, 1, 2, 1, 0] } });
		const classes = dots().map((d) => d.className);
		expect(classes).toEqual([
			expect.stringContaining('ds-dot-error'),
			expect.stringContaining('ds-dot-success'),
			expect.stringContaining('ds-dot-warning'),
			expect.stringContaining('ds-dot-success'),
			expect.stringContaining('ds-dot-error')
		]);
	});

	it('renders no dots for an empty row', () => {
		render(ScorecardHarness, { props: { scores: [] } });
		expect(dots()).toHaveLength(0);
	});
});

describe('Scorecard is readable without colour (WCAG 1.4.1)', () => {
	it('summarises the row as an accessible name, tracking the actual scores', () => {
		render(ScorecardHarness, { props: { scores: [0, 1, 2] } });
		const root = document.querySelector('[role="img"]');
		expect(root).toHaveAttribute('aria-label', 'off, on, warn');
	});
});
