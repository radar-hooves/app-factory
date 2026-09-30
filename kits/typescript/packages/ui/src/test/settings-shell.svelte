<script lang="ts">
	// Harness for the settings destination, in the shape a consuming app uses it:
	// inside AppShell with `padded={false}`, one group with no personal sections
	// yet (left in the list, empty, and therefore not rendered), and a section
	// whose own sub-page exercises the prefix match.
	import AppShell from '$lib/components/ui/app-shell/app-shell.svelte';
	import SettingsShell from '$lib/components/ui/settings-shell/settings-shell.svelte';
	import type { NavSource } from '$lib/components/ui/app-shell/types.js';
	import Panel from '$lib/components/ui/panel/panel.svelte';
	import Users from '@lucide/svelte/icons/users';
	import Gavel from '@lucide/svelte/icons/gavel';
	import Info from '@lucide/svelte/icons/info';

	let {
		currentPath = $bindable('/settings/users'),
		personal = false
	}: { currentPath?: string; personal?: boolean } = $props();

	const sections: NavSource = $derived([
		{
			heading: 'Yours',
			items: personal ? [{ label: 'Profile', href: '/settings/profile', icon: Users }] : []
		},
		{
			heading: 'This company',
			items: [
				{ label: 'Users', href: '/settings/users', icon: Users },
				{ label: 'Delegation limits', href: '/settings/delegation-limits', icon: Gavel }
			]
		},
		{ heading: 'About', items: [{ label: 'About', href: '/settings/about', icon: Info }] }
	]);
</script>

<AppShell
	nav={[{ label: 'Overview', href: '/overview' }]}
	{currentPath}
	brandTitle="Harness"
	settingsHref="/settings"
	padded={false}
	themeToggle={false}
>
	<SettingsShell {sections} {currentPath}>
		<Panel title="Users" description="Who can sign in, and what each of them may do.">
			<p>Body</p>
			{#snippet footer()}
				<button type="button">Save</button>
			{/snippet}
		</Panel>
		<Panel title="Delete this workspace" tone="destructive">
			<p>Gone for good.</p>
		</Panel>
	</SettingsShell>
</AppShell>
