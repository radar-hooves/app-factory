<script lang="ts">
	// Harness for the shell's driven tests. The probes below are non-visual
	// (text nodes read by testid) so every assertion is on an OUTCOME rather than
	// on the fact that something drew.
	import AppShell from '$lib/components/ui/app-shell/app-shell.svelte';
	import CommandPalette from '$lib/components/ui/command-palette/command-palette.svelte';
	import type { NavSource } from '$lib/components/ui/app-shell/types.js';
	import type { ShellMeasure } from '$lib/components/ui/app-shell/measure.js';
	import type { ShellTexture } from '$lib/components/ui/app-shell/texture.js';
	import Package from '@lucide/svelte/icons/package';

	let {
		currentPath = $bindable('/overview'),
		collapsible,
		navLabel,
		measure,
		texture,
		mainClass,
		searchPlacement
	}: {
		currentPath?: string;
		/** Undefined by default, so the harness drives the package's own default
		    rather than a value the harness chose — same contract as measure/texture. */
		collapsible?: boolean;
		navLabel?: string;
		/** Left undefined by default, so the additivity gate drives the shell
		    exactly as a consumer who never heard of the prop does. */
		measure?: ShellMeasure;
		/** Undefined by default, for the same reason `measure` is. */
		texture?: ShellTexture;
		/** The pre-existing seam, so the texture is driven composed with an app's
		    own class rather than only on its own. */
		mainClass?: string;
		/** Undefined by default, so the leading default is what the unset harness
		    drives — same additivity contract as measure/texture. */
		searchPlacement?: 'leading' | 'trailing';
	} = $props();

	const nav: NavSource = [
		{ label: 'Overview', href: '/overview', icon: Package },
		{
			heading: 'Access',
			items: [
				{ label: 'Credentials', href: '/credentials', icon: Package, badge: 3 },
				{ label: 'Identities', href: '/identities', icon: Package }
			]
		},
		{ heading: 'Empty', items: [] },
		{ label: 'Docs', href: 'https://example.invalid/docs', external: true }
	];

	let paletteOpen = $state(false);
	let themeFlips = $state(0);
	let navigatedTo = $state('none');
	let collapsed = $state(false);
</script>

<div data-testid="probe-theme">{themeFlips}</div>
<div data-testid="probe-navigated">{navigatedTo}</div>
<div data-testid="probe-collapsed">{collapsed ? 'collapsed' : 'expanded'}</div>
<div data-testid="probe-palette">{paletteOpen ? 'open' : 'closed'}</div>

<AppShell
	{nav}
	{navLabel}
	{currentPath}
	{collapsible}
	{measure}
	{texture}
	{mainClass}
	{searchPlacement}
	bind:collapsed
	brandTitle="Harness"
	onSearch={() => (paletteOpen = true)}
	onToggleTheme={() => (themeFlips += 1)}
>
	{#snippet identity()}
		<button data-testid="identity">Signed in</button>
	{/snippet}
	{#snippet banner()}
		<div data-testid="banner">Reconnect required</div>
	{/snippet}
	{#snippet actions()}
		<button data-testid="action">Support</button>
	{/snippet}
	<p>Page body</p>
</AppShell>

<CommandPalette
	bind:open={paletteOpen}
	{nav}
	onNavigate={(href) => (navigatedTo = href)}
	placeholder="Search the harness…"
/>
