/**
 * The `fact-grid` primitive.
 *
 * The claims that matter: a numeric fact renders in the figures' face and a
 * plain-words one does not (the whole reason this exists beside StatList,
 * whose value is unconditionally mono); and a long value — a sentence, an
 * address — spans the row rather than being squeezed into one grid cell
 * beside three empty neighbours.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
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
