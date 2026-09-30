// Behaviour proof for the TanStack-backed pair (rules-library/core/73-verification.md
// §"Behaviour vs Appearance"). Every assertion drives the real table pipeline and
// then reads an OUTCOME — the rendered row order, the surviving row count, a
// callback's recorded value — never a static render. A data table that draws
// perfectly and never sorts would pass a snapshot gate and fail every test here.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import DataTableHarness from './composed-data-table.svelte';

/** Row order as the component actually rendered it, read from the DOM. */
function renderedNames(): string[] {
	const body = document.querySelector('tbody');
	if (!body) return [];
	return [...body.querySelectorAll('tr')].map(
		// Column 0 is the bulk-selection checkbox; column 1 is `name`.
		(tr) => tr.querySelectorAll('td')[1]?.textContent?.trim() ?? ''
	);
}

/** The `<th>` whose rendered header text matches, by walking the DOM rather than
 *  assuming a column index — new meta-only columns append after `name`/`state`. */
function headerCellFor(label: string): HTMLElement | undefined {
	return [...document.querySelectorAll('thead th')].find(
		(th) => th.textContent?.trim() === label
	) as HTMLElement | undefined;
}

/** Every row's `<td>` for the column whose header text matches. */
function bodyCellsFor(label: string): HTMLElement[] {
	const headers = [...document.querySelectorAll('thead th')];
	const index = headers.findIndex((th) => th.textContent?.trim() === label);
	return [...document.querySelectorAll('tbody tr')].map(
		(tr) => tr.querySelectorAll('td')[index] as HTMLElement
	);
}

describe('DataTableTanstack — sorting', () => {
	it('reorders the rendered rows when a sort is applied', async () => {
		render(DataTableHarness);

		// Instant one: source order.
		expect(renderedNames()).toEqual(['charlie', 'alpha', 'bravo']);

		await fireEvent.click(screen.getByRole('button', { name: 'Sort by name' }));

		// Instant two: the order actually advanced, it is not frozen at its initial value.
		await waitFor(() => {
			expect(renderedNames()).toEqual(['alpha', 'bravo', 'charlie']);
		});
	});
});

describe('DataTableToolbar — global search', () => {
	it('narrows the table to matching rows as the search value changes', async () => {
		render(DataTableHarness);
		expect(renderedNames()).toHaveLength(3);

		const search = screen.getByPlaceholderText('Filter rows…');
		await fireEvent.input(search, { target: { value: 'alph' } });

		await waitFor(() => {
			expect(renderedNames()).toEqual(['alpha']);
		});
	});

	it('renders the empty branch when the search matches nothing', async () => {
		render(DataTableHarness);

		await fireEvent.input(screen.getByPlaceholderText('Filter rows…'), {
			target: { value: 'no-such-row' }
		});

		await waitFor(() => {
			expect(screen.getByText('No rows match')).toBeInTheDocument();
			expect(screen.getByText('Loosen the filter.')).toBeInTheDocument();
		});
		expect(document.querySelector('tbody')).not.toBeInTheDocument();
	});
});

describe('DataTableToolbar — filter chips', () => {
	it('applies a column filter and marks the pressed chip', async () => {
		render(DataTableHarness);

		const failed = screen.getByRole('button', { name: 'Failed' });
		expect(failed).toHaveAttribute('aria-pressed', 'false');

		await fireEvent.click(failed);

		await waitFor(() => {
			expect(renderedNames()).toEqual(['alpha']);
		});
		expect(failed).toHaveAttribute('aria-pressed', 'true');
		expect(failed.className).toContain('ds-chip-error');
	});

	it('restores every row when the All chip is pressed again', async () => {
		render(DataTableHarness);

		await fireEvent.click(screen.getByRole('button', { name: 'Healthy' }));
		await waitFor(() => expect(renderedNames()).toEqual(['charlie', 'bravo']));

		await fireEvent.click(screen.getByRole('button', { name: 'All' }));
		await waitFor(() => expect(renderedNames()).toHaveLength(3));
	});
});

describe('DataTableTanstack — master-detail selection', () => {
	it('fires onSelect with the row id and marks the row selected', async () => {
		render(DataTableHarness);
		expect(screen.getByTestId('selected-id')).toHaveTextContent('none');

		const rows = document.querySelectorAll('tbody tr');
		await fireEvent.click(rows[1]);

		await waitFor(() => {
			expect(screen.getByTestId('selected-id')).toHaveTextContent('r2');
		});
		await waitFor(() => {
			expect(document.querySelectorAll('tbody tr')[1]).toHaveAttribute('data-state', 'selected');
		});
	});

	it('selects a row from the keyboard', async () => {
		render(DataTableHarness);

		await fireEvent.keyDown(document.querySelectorAll('tbody tr')[2], { key: 'Enter' });

		await waitFor(() => {
			expect(screen.getByTestId('selected-id')).toHaveTextContent('r3');
		});
	});
});

describe('DataTableTanstack — column meta class slots', () => {
	it('applies meta.class to both the header and every body cell', () => {
		render(DataTableHarness);

		expect(headerCellFor('Class Only')?.classList.contains('meta-class-both')).toBe(true);
		for (const cell of bodyCellsFor('Class Only')) {
			expect(cell.classList.contains('meta-class-both')).toBe(true);
		}
	});

	it('applies meta.headClass to the header only, never the body cells', () => {
		render(DataTableHarness);

		expect(headerCellFor('Head Only')?.classList.contains('meta-head-only')).toBe(true);
		for (const cell of bodyCellsFor('Head Only')) {
			expect(cell.classList.contains('meta-head-only')).toBe(false);
		}
	});

	it('applies meta.cellClass to the body cells only, never the header', () => {
		render(DataTableHarness);

		expect(headerCellFor('Cell Only')?.classList.contains('meta-cell-only')).toBe(false);
		for (const cell of bodyCellsFor('Cell Only')) {
			expect(cell.classList.contains('meta-cell-only')).toBe(true);
		}
	});

	it('renders a body cell carrying both meta.class and meta.cellClass, header carrying class alone', () => {
		render(DataTableHarness);

		const header = headerCellFor('Combo');
		expect(header?.classList.contains('w-full')).toBe(true);
		expect(header?.classList.contains('max-w-0')).toBe(false);

		for (const cell of bodyCellsFor('Combo')) {
			expect(cell.classList.contains('w-full')).toBe(true);
			expect(cell.classList.contains('max-w-0')).toBe(true);
		}
	});
});

describe('DataTableTanstack — bulk selection', () => {
	it('reports the selected ids when a row checkbox is ticked', async () => {
		render(DataTableHarness);
		expect(screen.getByTestId('bulk-selection')).toHaveTextContent('none');

		const firstRow = document.querySelectorAll('tbody tr')[0];
		await fireEvent.click(within(firstRow as HTMLElement).getByRole('checkbox'));

		await waitFor(() => {
			expect(screen.getByTestId('bulk-selection')).toHaveTextContent('r1');
		});
	});

	it('does not trigger the master-detail select when the checkbox is clicked', async () => {
		render(DataTableHarness);

		const firstRow = document.querySelectorAll('tbody tr')[0];
		await fireEvent.click(within(firstRow as HTMLElement).getByRole('checkbox'));

		await waitFor(() => expect(screen.getByTestId('bulk-selection')).toHaveTextContent('r1'));
		expect(screen.getByTestId('selected-id')).toHaveTextContent('none');
	});

	it('selects and clears every visible row from the header checkbox', async () => {
		render(DataTableHarness);

		const selectAll = screen.getByRole('checkbox', { name: 'Select all rows' });
		await fireEvent.click(selectAll);

		await waitFor(() => {
			expect(screen.getByTestId('bulk-selection')).toHaveTextContent('r1,r2,r3');
		});

		await fireEvent.click(selectAll);
		await waitFor(() => {
			expect(screen.getByTestId('bulk-selection')).toHaveTextContent('none');
		});
	});

	it('shows the header checkbox as indeterminate on a partial selection', async () => {
		render(DataTableHarness);
		const selectAll = screen.getByRole('checkbox', { name: 'Select all rows' });
		expect(selectAll).toHaveAttribute('aria-checked', 'false');

		const firstRow = document.querySelectorAll('tbody tr')[0];
		await fireEvent.click(within(firstRow as HTMLElement).getByRole('checkbox'));

		// One of three ticked: neither all nor none, so the header must say "mixed"
		// rather than lie in either direction.
		await waitFor(() => {
			expect(selectAll).toHaveAttribute('aria-checked', 'mixed');
		});

		await fireEvent.click(selectAll);
		await waitFor(() => {
			expect(selectAll).toHaveAttribute('aria-checked', 'true');
		});
	});

	it('returns the current selection from the imperative getSelectedIds()', async () => {
		render(DataTableHarness);

		await fireEvent.click(screen.getByRole('button', { name: 'Read selected ids' }));
		await waitFor(() => expect(screen.getByTestId('imperative-ids')).toHaveTextContent('none'));

		const firstRow = document.querySelectorAll('tbody tr')[0];
		await fireEvent.click(within(firstRow as HTMLElement).getByRole('checkbox'));
		await waitFor(() => expect(screen.getByTestId('bulk-selection')).toHaveTextContent('r1'));

		await fireEvent.click(screen.getByRole('button', { name: 'Read selected ids' }));
		await waitFor(() => {
			expect(screen.getByTestId('imperative-ids')).toHaveTextContent('r1');
		});
	});

	it('drops a filtered-away row from the bulk selection', async () => {
		render(DataTableHarness);

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
		await waitFor(() => expect(screen.getByTestId('bulk-selection')).toHaveTextContent('r1,r2,r3'));

		// 'alpha' (r2) is the only 'error' row, so filtering to Healthy must evict it.
		await fireEvent.click(screen.getByRole('button', { name: 'Healthy' }));

		await waitFor(() => {
			expect(screen.getByTestId('bulk-selection')).toHaveTextContent('r1,r3');
		});
	});
});
