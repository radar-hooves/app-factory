/**
 * Behaviour proof for Sheet: its trigger opens a dialog named by the title and
 * described by the description, the Close button and Escape both close it, and
 * `side` is reflected on the content.
 *
 * Not asserted: which edge the panel sits on, the slide animation, the overlay
 * dimming. Those are CSS and need a real browser; only `data-side`, the hook
 * they hang from, is asserted.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import Harness from './sheet.svelte';

const open = async () => {
	render(Harness);
	await fireEvent.click(screen.getByRole('button', { name: 'Open filters' }));
	return screen.findByRole('dialog', { name: 'Filters' });
};

describe('Sheet', () => {
	it('is closed until the trigger is used', () => {
		render(Harness);
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('opens a dialog named by its title and described by its description', async () => {
		const dialog = await open();
		expect(dialog).toHaveAccessibleDescription('Narrow the list.');
		expect(screen.getByText('Sheet body')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
	});

	it('closes from its Close button', async () => {
		await open();
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
	});

	it('closes on Escape', async () => {
		const dialog = await open();
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
	});

	it('reflects side as data-side, right by default', async () => {
		const dialog = await open();
		expect(dialog).toHaveAttribute('data-side', 'right');
	});

	it.each(['left', 'top', 'bottom'] as const)('reflects side="%s" as data-side', async (side) => {
		render(Harness, { props: { side } });
		await fireEvent.click(screen.getByRole('button', { name: 'Open filters' }));
		expect(await screen.findByRole('dialog', { name: 'Filters' })).toHaveAttribute(
			'data-side',
			side
		);
	});
});
