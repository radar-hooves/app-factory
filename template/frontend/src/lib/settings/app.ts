import type { NavSource } from '@poodle64/ui/app-shell';

/**
 * This app's own settings groups, listed before the factory's "This
 * deployment".
 *
 * THE extension point for routes/(protected)/settings/+layout.svelte, which is
 * owed byte-identical: `settingsSections()` (sibling `sections.ts`) puts these
 * first, as `sveltekit-frontend.md` orders the destination (yours, then this
 * workspace's), and the factory's own group last. Each item's page is a route
 * of this app's own under routes/(protected)/settings/, and `/settings` itself
 * goes to the first one the caller can open.
 *
 * A function rather than a constant, so a group can read the auth store
 * (`auth.can('billing')`) and follow it. Empty is the correct state until the
 * app has a setting of its own.
 */
export function appSettingsSections(): NavSource {
	return [];
}
