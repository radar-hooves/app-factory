<!--
	The settings destination (rules-library/stacks/sveltekit-frontend.md): one
	shell, `SettingsShell` from `@poodle64/ui`, whose sections group by whose
	setting it is. `settingsSections()` lists this app's own groups first
	($lib/settings/app.ts, the app's extension point) and the factory's "This
	deployment" last, so an app adds its sections there and never here.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import SettingsShell from '@poodle64/ui/settings-shell';
	import { settingsSections } from '$lib/settings/sections';

	let { children }: { children: Snippet } = $props();

	const sections = $derived(settingsSections());
</script>

<SettingsShell {sections} currentPath={page.url.pathname}>
	{@render children()}
</SettingsShell>
