<script lang="ts">
	// Harness for nested navigation.
	//
	// Deliberately a SECOND harness rather than children bolted onto
	// `app-shell.svelte`: that file and the suite over it are the additive
	// guarantee made executable. It passes a nav with no `children` anywhere, and
	// every claim it makes about the flat rail — the drawer, the focus trap, the
	// collapse control, the active rules, the palette — has to keep passing
	// untouched, or nesting has changed something a consumer never asked for.
	import AppShell from '$lib/components/ui/app-shell/app-shell.svelte';
	import type { NavSource } from '$lib/components/ui/app-shell/types.js';
	import Package from '@lucide/svelte/icons/package';

	let {
		currentPath = $bindable('/overview'),
		collapsible = false,
		collapsed = $bindable(false)
	}: {
		currentPath?: string;
		collapsible?: boolean;
		collapsed?: boolean;
	} = $props();

	const nav: NavSource = [
		{ label: 'Overview', href: '/overview', icon: Package },
		{
			// The operator's case: a real page that also has a section beneath it,
			// with the children nested under the parent's own path.
			label: 'Education',
			href: '/education',
			icon: Package,
			children: [
				{ label: 'Topic one', href: '/education/one' },
				{ label: 'Topic two', href: '/education/two' }
			]
		},
		{
			// The harder case: children at their own top-level routes, which the
			// parent's prefix match cannot see. This is what `data-within` is for.
			label: 'Records',
			href: '/records',
			icon: Package,
			children: [
				{ label: 'Archive', href: '/archive' },
				{ label: 'Exports', href: '/exports' }
			]
		}
	];
</script>

<AppShell
	{nav}
	{currentPath}
	{collapsible}
	bind:collapsed
	brandTitle="Nested"
	themeToggle={false}
>
	<p>Page body</p>
</AppShell>
