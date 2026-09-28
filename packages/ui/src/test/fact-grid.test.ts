/**
 * The `fact-grid` primitive.
 *
 * The claims that matter: a numeric fact renders in the figures' face and a
 * plain-words one does not (the whole reason this exists beside StatList,
 * whose value is unconditionally mono); a long value — a sentence, an
 * address — spans the row rather than being squeezed into one grid cell
 * beside three empty neighbours; and a fact with evidence on the page (only
 * that one, never an un-placed neighbour) becomes a pointable control tied
 * to PageCanvas's own `activeRegionId`/`focusedRegionId` via the same key
 * (godswood #839).
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import FactGrid from '$lib/components/ui/fact-grid/fact-grid.svelte';
import type { Fact } from '$lib/components/ui/fact-grid/fact-grid.svelte';

function cellFor(label: string): HTMLElement {
	const dt = screen.getByText(label);
	const cell = dt.closest('div');
	expect(cell).not.toBeNull();
	return cell as HTMLElement;
}

describe('FactGrid renders each fact as an eyebrow over a value', () => {
	it('shows the label and value', () => {
		const facts: Fact[] = [{ key: 'a', label: 'Payee', value: 'Aldi' }];
		render(FactGrid, { props: { facts } });
		expect(screen.getByText('Payee')).toBeInTheDocument();
		expect(screen.getByText('Aldi')).toBeInTheDocument();
	});

	it('renders a numeric fact in the mono/tabular face', () => {
		const facts: Fact[] = [{ key: 'a', label: 'Total', value: '175.98', numeric: true }];
		render(FactGrid, { props: { facts } });
		expect(screen.getByText('175.98').className).toContain('font-mono');
	});

	it('does not put a plain-words fact in the mono face', () => {
		const facts: Fact[] = [{ key: 'a', label: 'Payee', value: 'Aldi' }];
		render(FactGrid, { props: { facts } });
		expect(screen.getByText('Aldi').className).not.toContain('font-mono');
	});

	it('does not span a short value across the row', () => {
		const facts: Fact[] = [{ key: 'a', label: 'Total', value: '175.98', numeric: true }];
		render(FactGrid, { props: { facts } });
		expect(cellFor('Total').className).not.toContain('col-span-full');
	});

	it('spans a long, sentence-length value across the row', () => {
		const facts: Fact[] = [
			{ key: 'a', label: 'Address', value: '221B Baker Street, Marylebone, London NW1 6XE' }
		];
		render(FactGrid, { props: { facts } });
		expect(cellFor('Address').className).toContain('col-span-full');
	});

	it('renders one entry per fact, keyed so React/Svelte keying is stable', () => {
		const facts: Fact[] = [
			{ key: 'a', label: 'Store', value: 'Aldi' },
			{ key: 'b', label: 'Date', value: '18/09/2026' },
			{ key: 'c', label: 'Total', value: '175.98', numeric: true }
		];
		render(FactGrid, { props: { facts } });
		expect(screen.getByText('Store')).toBeInTheDocument();
		expect(screen.getByText('Date')).toBeInTheDocument();
		expect(screen.getByText('Total')).toBeInTheDocument();
	});
});

describe('FactGrid — evidence affordance (#839)', () => {
	it('renders a fact with no evidence as plain text, never a control', () => {
		const facts: Fact[] = [{ key: 'a', label: 'Payee', value: 'Aldi' }];
		render(FactGrid, { props: { facts } });
		expect(screen.queryByRole('button', { name: 'Aldi' })).not.toBeInTheDocument();
		expect(screen.getByText('Aldi')).toBeInTheDocument();
	});

	it('renders an evidenced fact as a focusable, not-yet-pressed control', () => {
		const facts: Fact[] = [{ key: 'a', label: 'Payee', value: 'Aldi', hasEvidence: true }];
		render(FactGrid, { props: { facts } });
		expect(screen.getByRole('button', { name: 'Aldi' })).toHaveAttribute('aria-pressed', 'false');
	});

	it('leaves an unevidenced fact plain alongside an evidenced neighbour', () => {
		const facts: Fact[] = [
			{ key: 'a', label: 'Payee', value: 'Aldi' },
			{ key: 'b', label: 'Total', value: '175.98', numeric: true, hasEvidence: true }
		];
		render(FactGrid, { props: { facts } });
		expect(screen.queryByRole('button', { name: 'Aldi' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: '175.98' })).toBeInTheDocument();
	});

	it('toggles aria-pressed and back on a second click', async () => {
		const facts: Fact[] = [{ key: 'store', label: 'Store', value: 'Aldi', hasEvidence: true }];
		render(FactGrid, { props: { facts } });
		const button = screen.getByRole('button', { name: 'Aldi' });
		await fireEvent.click(button);
		expect(button).toHaveAttribute('aria-pressed', 'true');
		await fireEvent.click(button);
		expect(button).toHaveAttribute('aria-pressed', 'false');
	});

	it('reflects an externally-focused fact as pressed from the start', () => {
		const facts: Fact[] = [{ key: 'store', label: 'Store', value: 'Aldi', hasEvidence: true }];
		render(FactGrid, { props: { facts, focusedFactId: 'store' } });
		expect(screen.getByRole('button', { name: 'Aldi' })).toHaveAttribute('aria-pressed', 'true');
	});

	it('shows the active highlight on hover, and clears it on mouseleave', async () => {
		const facts: Fact[] = [{ key: 'store', label: 'Store', value: 'Aldi', hasEvidence: true }];
		render(FactGrid, { props: { facts } });
		const button = screen.getByRole('button', { name: 'Aldi' });
		expect(button.className).not.toContain('bg-primary/10');
		await fireEvent.mouseEnter(button);
		expect(button.className).toContain('bg-primary/10');
		await fireEvent.mouseLeave(button);
		expect(button.className).not.toContain('bg-primary/10');
	});

	it('shows the active highlight on keyboard focus, and clears it on blur', async () => {
		const facts: Fact[] = [{ key: 'store', label: 'Store', value: 'Aldi', hasEvidence: true }];
		render(FactGrid, { props: { facts } });
		const button = screen.getByRole('button', { name: 'Aldi' });
		await fireEvent.focus(button);
		expect(button.className).toContain('bg-primary/10');
		await fireEvent.blur(button);
		expect(button.className).not.toContain('bg-primary/10');
	});

	it('keeps the active highlight while held focused, even after the pointer leaves', async () => {
		const facts: Fact[] = [{ key: 'store', label: 'Store', value: 'Aldi', hasEvidence: true }];
		render(FactGrid, { props: { facts } });
		const button = screen.getByRole('button', { name: 'Aldi' });
		await fireEvent.click(button);
		await fireEvent.mouseEnter(button);
		await fireEvent.mouseLeave(button);
		expect(button).toHaveAttribute('aria-pressed', 'true');
		expect(button.className).toContain('bg-primary/10');
	});
});
