import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
import { toItems, type NavSource } from '@poodle64/ui/app-shell';
import { auth } from '$lib/auth.svelte';
import { appSettingsSections } from './app';

/**
 * Everything the settings destination lists: this app's own groups (`./app`),
 * then the factory's "This deployment", the operator-facing runtime settings
 * any declared Setting joins (docs/design/settings.md). That group is shown
 * only to whoever holds the admin entitlement; a caller without it sees the
 * app's groups alone, rather than a 403 page, since the rail's own Settings row
 * is what sent them here.
 *
 * Read inside a `$derived`, so the list follows the auth store.
 */
export function settingsSections(): NavSource {
	return [
		...appSettingsSections(),
		{
			heading: 'This deployment',
			items: auth.can('admin')
				? [{ href: '/settings/application', label: 'Application', icon: SlidersHorizontal }]
				: []
		}
	];
}

/** Where `/settings` goes: the first page the caller can open, if any. */
export function firstSettingsHref(sections: NavSource): string | undefined {
	return toItems(sections)[0]?.href;
}
