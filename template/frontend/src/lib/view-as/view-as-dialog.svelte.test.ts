import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const viewAsColleague = vi.fn();
const reloadPage = vi.fn();
const stopViewingAs = vi.fn();
const state = vi.hoisted(() => ({ viewingAs: false }));

vi.mock('$lib/auth.svelte', () => ({
	auth: {
		held: ['admin', 'reports', 'example'],
		entitlements: ['reports'],
		get viewingAs() {
			return state.viewingAs;
		},
		viewAsColleague: (...args: unknown[]) => viewAsColleague(...args),
		stopViewingAs: () => stopViewingAs()
	}
}));
vi.mock('./reload', () => ({ reloadPage: () => reloadPage() }));

import ViewAsBanner from './view-as-banner.svelte';
import ViewAsDialog from './view-as-dialog.svelte';

beforeEach(() => {
	vi.clearAllMocks();
	state.viewingAs = false;
});

describe('the View as colleague dialog', () => {
	it('lists the real set all ticked and applies the ticked subset', async () => {
		render(ViewAsDialog, { open: true });

		for (const name of ['admin', 'reports', 'example']) {
			expect(screen.getByRole('checkbox', { name })).toBeChecked();
		}
		await fireEvent.click(screen.getByRole('checkbox', { name: 'admin' }));
		await fireEvent.click(screen.getByTestId('view-as-apply'));

		expect(viewAsColleague).toHaveBeenCalledWith(['reports', 'example']);
		expect(reloadPage).toHaveBeenCalledOnce();
	});

	it('changes nothing on Cancel', async () => {
		render(ViewAsDialog, { open: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(viewAsColleague).not.toHaveBeenCalled();
		expect(reloadPage).not.toHaveBeenCalled();
	});

	it('says the library collections are still the admin own', () => {
		render(ViewAsDialog, { open: true });
		expect(
			screen.getByText(/collections the library shows are still the ones you can read/i)
		).toBeInTheDocument();
	});
});

describe('the View as colleague banner', () => {
	it('is absent unless narrowing is active', () => {
		render(ViewAsBanner);
		expect(screen.queryByTestId('view-as-banner')).toBeNull();
	});

	it('stops and reloads', async () => {
		state.viewingAs = true;
		render(ViewAsBanner);
		await fireEvent.click(screen.getByRole('button', { name: 'Stop viewing as colleague' }));

		expect(stopViewingAs).toHaveBeenCalledOnce();
		expect(reloadPage).toHaveBeenCalledOnce();
	});
});
