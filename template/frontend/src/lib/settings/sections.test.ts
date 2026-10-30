import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toItems } from '@poodle64/ui/app-shell';

import { firstSettingsHref, settingsSections } from './sections';

const held = vi.hoisted(() => ({ entitlements: [] as string[] }));
const appSections = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock('$lib/auth.svelte', () => ({
	auth: { can: (module: string) => held.entitlements.includes(module) }
}));

vi.mock('$lib/app-frame.svelte', () => ({ workspaceLabel: 'Workspace' }));

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
			'This workspace',
			'This deployment'
		]);
	});

	it('sends /settings to the first page the caller can open', () => {
		appSections.value = [ACCOUNT];
		expect(firstSettingsHref(settingsSections())).toBe('/settings/profile');
	});

	it("sends a caller with no settings of the app's own to the members", () => {
		held.entitlements = ['admin'];
		expect(firstSettingsHref(settingsSections())).toBe('/settings/members');
	});

	it('lists the deployment only to an admin', () => {
		const hrefs = () => toItems(settingsSections()).map((item) => item.href);
		expect(hrefs()).not.toContain('/settings/application');
		held.entitlements = ['admin'];
		expect(hrefs()).toContain('/settings/application');
	});
});
