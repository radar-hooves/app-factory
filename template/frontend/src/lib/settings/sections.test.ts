import { beforeEach, describe, expect, it, vi } from 'vitest';

import { firstSettingsHref, settingsSections } from './sections';

const held = vi.hoisted(() => ({ entitlements: [] as string[] }));
const appSections = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock('$lib/auth.svelte', () => ({
	auth: { can: (module: string) => held.entitlements.includes(module) }
}));

vi.mock('./app', () => ({ appSettingsSections: () => appSections.value }));

const ACCOUNT = {
	heading: 'Your account',
	items: [{ href: '/settings/profile', label: 'Profile' }]
};

beforeEach(() => {
	held.entitlements = [];
	appSections.value = [];
});

describe('the settings destination', () => {
	it("lists this app's own groups before the factory's", () => {
		appSections.value = [ACCOUNT];
		held.entitlements = ['admin'];

		expect(settingsSections().map((group) => ('heading' in group ? group.heading : ''))).toEqual([
			'Your account',
			'This deployment'
		]);
	});

	it('sends /settings to the first page the caller can open', () => {
		appSections.value = [ACCOUNT];
		expect(firstSettingsHref(settingsSections())).toBe('/settings/profile');
	});

	it("sends an admin with no settings of the app's own to the deployment's", () => {
		held.entitlements = ['admin'];
		expect(firstSettingsHref(settingsSections())).toBe('/settings/application');
	});

	it('has nowhere to send a caller who can open nothing', () => {
		expect(firstSettingsHref(settingsSections())).toBeUndefined();
	});
});
