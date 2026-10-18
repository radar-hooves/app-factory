import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { goto } from '$app/navigation';
import Page from './+page.svelte';

// `/settings` sends the caller on to their first settings page. A redirect the
// router dropped (a navigation or invalidation that took its token mid-load)
// leaves this page shown, so it asks again; one that landed unmounts it.

vi.mock('$lib/settings/sections', () => ({
	settingsSections: () => [],
	firstSettingsHref: () => '/settings/account'
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the settings index', () => {
	beforeEach(() => vi.mocked(goto).mockReset());

	it('asks again while a dropped redirect leaves it shown, a bounded number of times', async () => {
		vi.mocked(goto).mockResolvedValue(undefined);
		render(Page);
		await settle();

		expect(goto).toHaveBeenCalledTimes(3);
		expect(goto).toHaveBeenCalledWith('/settings/account', { replaceState: true });
	});

	it('asks once when the redirect lands', async () => {
		// The redirect is asked for as the page mounts, so it lands a tick later,
		// once `unmount` is in hand.
		let leave: () => void = () => {};
		vi.mocked(goto).mockImplementation(async () => {
			await Promise.resolve();
			leave();
		});
		const { unmount } = render(Page);
		leave = unmount;
		await settle();

		expect(goto).toHaveBeenCalledTimes(1);
	});
});
