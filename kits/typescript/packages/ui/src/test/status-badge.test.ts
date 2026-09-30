/**
 * The `status-badge` primitive: the one state chip, styled by `.ds-chip`/
 * `.ds-dot` in `styles.css`.
 *
 * The claim that matters is that `status` actually maps to the matching
 * `.ds-chip-{status}`/`.ds-dot-{status}` pair, not a fixed pair every value
 * happens to render — covering the shared five-state vocabulary plus this
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

function dot(): HTMLElement {
	const el = document.querySelector('.ds-dot');
	expect(el).not.toBeNull();
	return el as HTMLElement;
}

describe('StatusBadge maps status to its own chip/dot pair', () => {
	it.each(STATES)('renders the %s chip and dot classes, and the label', (status) => {
		render(StatusBadgeHarness, { props: { status, label: `Status ${status}` } });
		expect(chip().className).toContain(`ds-chip-${status}`);
		expect(dot().className).toContain(`ds-dot-${status}`);
		expect(screen.getByText(`Status ${status}`)).toBeInTheDocument();
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
		expect(dot().className).not.toContain('ds-dot-pulse');
	});

	it('adds the pulse class when a state is still moving', () => {
		render(StatusBadgeHarness, { props: { status: 'info', label: 'Syncing', pulse: true } });
		expect(dot().className).toContain('ds-dot-pulse');
	});
});

describe('StatusBadge class merging', () => {
	it('adds a caller class without dropping the base chip class', () => {
		render(StatusBadgeHarness, { props: { status: 'success', label: 'OK', class: 'ml-2' } });
		expect(chip().className).toContain('ds-chip');
		expect(chip().className).toContain('ml-2');
	});
});
