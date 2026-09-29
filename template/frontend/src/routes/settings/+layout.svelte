<!--
	The settings destination (rules-library/stacks/sveltekit-frontend.md): one
	shell, `SettingsShell` from `@poodle64/ui`, whose sections group by whose
	setting it is. The factory ships one group, "This deployment" — the
	operator-facing runtime settings any declared Setting joins
	(docs/design/settings.md) — shown only to whoever holds the admin
	entitlement; a caller without it sees an empty settings destination rather
	than a 403 page, since the rail's own Settings row is what sent them here.

	An app adding a personal or workspace settings group extends this same
	`sections` array when it has one to add; nothing here is built ahead of
	that need.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import type { NavSource } from '@poodle64/ui/app-shell';
	import SettingsShell from '@poodle64/ui/settings-shell';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import { auth } from '$lib/auth.svelte';

	let { children }: { children: Snippet } = $props();

	const sections: NavSource = $derived([
		{
			heading: 'This deployment',
			items: auth.can('admin')
				? [{ href: '/settings/application', label: 'Application', icon: SlidersHorizontal }]
				: []
		}
	]);
</script>

<SettingsShell {sections} currentPath={page.url.pathname}>
	{@render children()}
</SettingsShell>
