import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { goto } from '$app/navigation';
import Page from './+page.svelte';

// `/settings` sends the caller on to their first settings page. A redirect the
// router dropped (a navigation or invalidation that took its token mid-load)
// leaves this page shown, so it asks again; one that landed unmounts it.

const router = vi.hoisted(() => ({
	page: { url: new URL('http://localhost/settings') },
	navigating: { to: null as { url: URL } | null }
}));

vi.mock('$app/state', () => router);

vi.mock('$lib/settings/sections', () => ({
	settingsSections: () => [],
	firstSettingsHref: () => '/settings/account'
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the settings index', () => {
	beforeEach(() => {
		vi.mocked(goto).mockReset();
		router.navigating.to = null;
		router.page.url = new URL('http://localhost/settings');
	});

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

	it('leaves a navigation the reader started meanwhile alone', async () => {
		vi.mocked(goto).mockImplementation(async () => {
			router.navigating.to = { url: new URL('http://localhost/settings/members') };
		});
		render(Page);
		await settle();

		expect(goto).toHaveBeenCalledTimes(1);
	});

	it('stops when the redirect is cancelled', async () => {
		vi.mocked(goto).mockRejectedValue(new Error('navigation cancelled'));
		render(Page);
		await settle();

		expect(goto).toHaveBeenCalledTimes(1);
	});
});
