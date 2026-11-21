/**
 * The `status-badge` primitive: the one state chip, styled by `.ds-chip`/
 * `.ds-status-icon` in `styles.css`.
 *
 * The claim that matters is that `status` actually maps to the matching
 * `.ds-chip-{status}` and a glyph of its own in `.ds-ink-{status}`, not a fixed
 * pair every value happens to render — covering the shared five-state vocabulary plus this
 * component's own `'primary'` extension (design-system#15), which the shared
 * `Status` type does not carry.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import StatusBadgeHarness from './status-badge.svelte';

const STATES = ['success', 'warning', 'error', 'info', 'neutral', 'primary'] as const;

function chip(): HTMLElement {
	const el = document.querySelector('.ds-chip');
	expect(el).not.toBeNull();
	return el as HTMLElement;
}

function mark(): string {
	const el = document.querySelector('.ds-chip .ds-status-icon');
	expect(el).not.toBeNull();
	return el?.getAttribute('class') ?? '';
}

describe('StatusBadge maps status to its own chip and glyph', () => {
	it.each(STATES)('renders the %s chip, its glyph in its ink, and the label', (status) => {
		render(StatusBadgeHarness, { props: { status, label: `Status ${status}` } });
		expect(chip().className).toContain(`ds-chip-${status}`);
		expect(mark()).toContain(`ds-ink-${status}`);
		expect(screen.getByText(`Status ${status}`)).toBeInTheDocument();
	});

	it('draws each state in a glyph of its own, so states differ in shape as well as hue', () => {
		const glyphs = STATES.map((status) => {
			const { unmount } = render(StatusBadgeHarness, { props: { status, label: status } });
			const glyph = /ds-icon-(?!tone)[\w-]+/.exec(mark())?.[0];
			unmount();
			return glyph;
		});
		expect(glyphs.every(Boolean)).toBe(true);
		expect(new Set(glyphs).size).toBe(STATES.length);
	});
});

describe("StatusBadge's primary extension", () => {
	it('is reachable through the same status prop as the shared vocabulary', () => {
		render(StatusBadgeHarness, { props: { status: 'primary', label: 'Brand' } });
		expect(chip().className).toContain('ds-chip-primary');
		expect(chip().className).not.toContain('ds-chip-success');
	});
});

describe('StatusBadge pulse', () => {
	it('carries no pulse class by default', () => {
		render(StatusBadgeHarness, { props: { status: 'info', label: 'Idle' } });
		expect(mark()).not.toContain('ds-dot-pulse');
	});

	it('adds the pulse class when a state is still moving', () => {
		render(StatusBadgeHarness, { props: { status: 'info', label: 'Syncing', pulse: true } });
		expect(mark()).toContain('ds-dot-pulse');
	});
});

describe('StatusBadge class merging', () => {
	it('adds a caller class without dropping the base chip class', () => {
		render(StatusBadgeHarness, { props: { status: 'success', label: 'OK', class: 'ml-2' } });
		expect(chip().className).toContain('ds-chip');
		expect(chip().className).toContain('ml-2');
	});
});
