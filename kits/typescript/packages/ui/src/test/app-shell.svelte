<script lang="ts">
	// Harness for the shell's driven tests. The probes below are non-visual
	// (text nodes read by testid) so every assertion is on an OUTCOME rather than
	// on the fact that something drew.
	import AppShell from '$lib/components/ui/app-shell/app-shell.svelte';
	import CommandPalette from '$lib/components/ui/command-palette/command-palette.svelte';
	import type { NavSource } from '$lib/components/ui/app-shell/types.js';
	import type { PageColumnState, PageType } from '$lib/components/ui/app-shell/page.js';
import PagePane from '$lib/components/ui/app-shell/page-pane.svelte';
import PageAside from '$lib/components/ui/app-shell/page-aside.svelte';
	import type { ShellTexture } from '$lib/components/ui/app-shell/texture.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import Package from '@lucide/svelte/icons/package';

	let {
		currentPath = $bindable('/overview'),
		collapsible,
		navLabel,
		pageType,
		title,
		texture,
		searchPlacement,
		pane,
		aside
	}: {
		currentPath?: string;
		/** Undefined by default, so the harness drives the package's own default
		    rather than a value the harness chose — same contract as measure/texture. */
		collapsible?: boolean;
		navLabel?: string;
		/** Undefined by default, so the harness drives the shell's own default type. */
		pageType?: PageType;
		/** The bar's fallback name; undefined by default. */
		title?: string;
		/** Undefined by default, for the same reason `pageType` is. */
		texture?: ShellTexture;
		/** Undefined by default, so the leading default is what the unset harness
		    drives — same additivity contract as measure/texture. */
		searchPlacement?: 'leading' | 'trailing';
		/** Mounts a PagePane in the page. `location` names the bar on a panel page;
		    `folded` gives it a folded snippet; `remember` is its storage key. */
		pane?: { location?: string; folded?: boolean; remember?: string; fill?: boolean };
		/** Mounts a PageAside in the page. */
		aside?: boolean;
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
	let query = $state('');
	let asked = $state('none');
</script>

<div data-testid="probe-theme">{themeFlips}</div>
<div data-testid="probe-navigated">{navigatedTo}</div>
<div data-testid="probe-collapsed">{collapsed ? 'collapsed' : 'expanded'}</div>
<div data-testid="probe-query">{query}</div>
<div data-testid="probe-asked">{asked}</div>
<div data-testid="probe-palette">{paletteOpen ? 'open' : 'closed'}</div>

{#snippet paneBody({ fold }: PageColumnState)}
	<div data-testid="pane-body">Pane body</div>
	<button type="button" onclick={fold}>Fold pane</button>
{/snippet}
{#snippet paneFolded({ unfold }: PageColumnState)}
	<button type="button" data-testid="pane-folded" onclick={unfold}>Unfold pane</button>
{/snippet}

<AppShell
	{nav}
	{navLabel}
	{currentPath}
	{collapsible}
	{pageType}
	{title}
	{texture}
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
	{#if pane}
		{#if pane.folded}
			<PagePane
				label="Sections"
				location={pane.location}
				remember={pane.remember}
				fill={pane.fill}
				body={paneBody}
				folded={paneFolded}
			/>
		{:else}
			<PagePane
				label="Sections"
				location={pane.location}
				remember={pane.remember}
				fill={pane.fill}
				body={paneBody}
			/>
		{/if}
	{/if}
	{#if aside}
		<PageAside label="Context">
			<div data-testid="aside-body">Aside body</div>
		</PageAside>
	{/if}
	<p>Page body</p>
</AppShell>

<CommandPalette
	bind:open={paletteOpen}
	bind:query
	{nav}
	onNavigate={(href) => (navigatedTo = href)}
	placeholder="Search the harness…"
>
	{#snippet lead()}
		{#if query.trim()}
			<Command.Item
				forceMount
				value="ask"
				onSelect={() => {
					asked = query;
					paletteOpen = false;
				}}>Ask: {query}</Command.Item
			>
		{/if}
	{/snippet}
</CommandPalette>
