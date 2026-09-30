/**
 * Behaviour proof for ListShell (rules-library/core/verification.md
 * §"Behaviour vs Appearance").
 *
 * What this file deliberately does NOT assert: colour, width or layout —
 * jsdom applies no stylesheet, so a `bg-shell`/`w-[25rem]` class resolving to
 * the rail's own chrome tokens and 400px is a real-browser claim (see
 * `harness/App.svelte` `?surface=list-shell` and `harness/drive.mjs`). What IS
 * asserted here is the disclosure contract: the landmark's name, the toggle's
 * `aria-expanded`, that the list actually vanishes (not just hides) when
 * closed, and that the caller's own reopen control — external to this
 * component by design — drives the same bound state back open.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Harness from './list-shell.svelte';

describe('ListShell — the disclosure contract', () => {
	it('is a named landmark while open', () => {
		render(Harness);
		expect(screen.getByRole('complementary', { name: 'Waiting on you' })).toBeInTheDocument();
	});

	it('renders the module’s own body, not a row shape of its own', () => {
		render(Harness);
		expect(screen.getByText('Aldi receipt')).toBeInTheDocument();
		expect(screen.getByText('Gas rates change notice')).toBeInTheDocument();
	});

	it('renders leading header actions the module supplies', () => {
		render(Harness);
		expect(screen.getByRole('button', { name: 'Add documents' })).toBeInTheDocument();
	});

	it('folds away to nothing — no placeholder, no hidden rail — on its own toggle', async () => {
		render(Harness);
		expect(screen.getByRole('complementary', { name: 'Waiting on you' })).toBeInTheDocument();

		const fold = screen.getByRole('button', { name: 'Fold Waiting on you away' });
		expect(fold).toHaveAttribute('aria-expanded', 'true');

		await fireEvent.click(fold);
		expect(screen.queryByRole('complementary', { name: 'Waiting on you' })).not.toBeInTheDocument();
	});

	it('reopens from the CALLER’s own control, at the position the caller chose', async () => {
		render(Harness);
		await fireEvent.click(screen.getByRole('button', { name: 'Fold Waiting on you away' }));
		expect(
			screen.queryByRole('complementary', { name: 'Waiting on you' })
		).not.toBeInTheDocument();

		// This button lives in the harness's own page body, not inside ListShell —
		// proving the reopen affordance is genuinely the caller's markup, driving
		// the same bound `open`, rather than something this component renders.
		const reopen = screen.getByRole('button', { name: 'Waiting on you' });
		expect(reopen).toHaveAttribute('aria-expanded', 'false');

		await fireEvent.click(reopen);
		expect(screen.getByRole('complementary', { name: 'Waiting on you' })).toBeInTheDocument();
	});

	it('names the fold toggle after the list it controls, not a bare "Fold"', () => {
		// A second ListShell instance on the same page must not collide on
		// "Fold away" — the label carries the list's own name.
		render(Harness);
		expect(
			screen.getByRole('button', { name: 'Fold Waiting on you away' })
		).toBeInTheDocument();
	});
});
