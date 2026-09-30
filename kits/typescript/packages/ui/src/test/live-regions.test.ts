// The announcement gate for the async-outcome surfaces. A failed load appears
// after the page has already settled: with no live region the page silently
// changes and the failure is invisible to a screen-reader user, which is a
// defect no snapshot, type-check or render assertion can see — the markup is
// identical either way. So each phase is DRIVEN and the region is asserted at
// the moment it arrives, not on a component mounted already-failed.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import LiveRegions from './live-regions.svelte';

const startLoad = () => fireEvent.click(screen.getByRole('button', { name: 'Start load' }));
const failLoad = () => fireEvent.click(screen.getByRole('button', { name: 'Fail the load' }));
const settleEmpty = () =>
	fireEvent.click(screen.getByRole('button', { name: 'Settle with no rows' }));

describe('async-outcome announcements', () => {
	it('opens no live region before a load is under way', () => {
		render(LiveRegions);
		expect(screen.getByTestId('phase')).toHaveTextContent('idle');
		expect(screen.queryByRole('status')).not.toBeInTheDocument();
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('announces a failure that arrives after the page has settled', async () => {
		render(LiveRegions);

		await startLoad();
		await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
		// The second instant is the point: nothing is asserting an alert that was
		// there all along, because at this instant there is none.
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();

		await failLoad();

		const alert = await screen.findByRole('alert');
		expect(alert).toHaveAttribute('aria-live', 'assertive');
		expect(alert).toHaveTextContent('Could not load the estate.');
		expect(screen.queryByRole('status')).not.toBeInTheDocument();
	});

	it('interrupts for a failure where it only waits its turn for a load', async () => {
		render(LiveRegions);

		await startLoad();
		// Loading is not urgent, so it is polite and self-labelling.
		const status = await screen.findByRole('status', { name: 'Fetching records…' });
		expect(status).toHaveAttribute('aria-live', 'polite');

		await failLoad();

		// A failure has already broken the user's task, so it interrupts.
		const alert = await screen.findByRole('alert');
		expect(alert).toHaveAttribute('aria-live', 'assertive');
	});

	// Unlike the assertions above, this one cannot be driven red from the
	// components: @lucide/svelte adds aria-hidden itself to any icon given no
	// aria-*/role/title and no children, so it holds whether or not either
	// component writes the attribute. It is a pin on the emitted output — the
	// contract a consumer actually sees — against that upstream default moving,
	// not coverage of the components' own source.
	it('keeps the decorative glyph out of both announcements', async () => {
		render(LiveRegions);

		await startLoad();
		const status = await screen.findByRole('status');
		expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

		await failLoad();

		const alert = await screen.findByRole('alert');
		// The message carries the meaning; an unhidden glyph would be announced
		// as meaningless content ahead of it.
		expect(alert.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
	});

	it('stays silent when the load settles with nothing to show', async () => {
		render(LiveRegions);

		await startLoad();
		await settleEmpty();

		await waitFor(() => expect(screen.getByText('No records')).toBeInTheDocument());
		// An empty result is not a failure and not urgent: EmptyState is ordinary
		// page content the app placed deliberately. Announcing a blank list as
		// loudly as a broken one is the over-correction this pins against.
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		expect(screen.queryByRole('status')).not.toBeInTheDocument();
	});
});
