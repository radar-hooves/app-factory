<!--
	The factory's frame: the shared shell composed from this app's declared
	`shell` data (#lib/shell.ts), around every signed-in route.

	Factory-owned and byte-identical in every app (parity-gated): an app never
	edits it. What an app is, its name, nav and account links, is data in
	shell.ts; what a screen is, `pageType`, `title` and `breadcrumbs`, is its
	route's load data. The rail, the sidebar and the page frames are the kit's
	(@poodle64/ui/app-shell), to the operator's ruling of 03/11/2026: the rail
	runs, from the far right, account, day/night, alerts, report, search;
	breadcrumbs on the left; the sidebar toggle on the sidebar's top; Settings
	in the account menu.

	THE extension point for routes/(protected)/+layout.svelte, which renders this
	around every signed-in route: the layout owns the session, the workspace and
	the guard. The frame renders from the first paint, before the session is
	confirmed, so nothing here may assume `auth.user`.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { AppIdentity } from '@poodle64/ui/app-identity';
	import { AppShell, resolveNav } from '@poodle64/ui/app-shell';
	import { CommandPalette } from '@poodle64/ui/command-palette';
	import { page } from '$app/state';
	import { dynamicPageTitle } from '#lib/page-title.svelte.js';
	import { goto } from '$app/navigation';
	import Eye from '@lucide/svelte/icons/eye';
	import { auth } from '#lib/auth.svelte.js';
	import { shell } from '#lib/shell.js';
	import AdminAlertBell from '#lib/alerts/admin-alert-bell.svelte';
	import ViewAsBanner from '#lib/view-as/view-as-banner.svelte';
	import ViewAsDialog from '#lib/view-as/view-as-dialog.svelte';
	import WorkspaceMenu from '#lib/workspaces/workspace-menu.svelte';

	let { children }: { children: Snippet } = $props();

	// One nav feeds BOTH the shell and the palette: a palette handed none finds
	// nothing while looking like it works. ⌘K is bound by CommandPalette itself.
	const nav = $derived(resolveNav(shell, auth));
	let paletteOpen = $state(false);
	let collapsed = $state(shell.railCollapsed ?? false);

	// One route, read by WorkspaceMenu (its own "Members" item, for several
	// memberships) and AppIdentity (onManageMembers, for exactly one).
	const membersHref = '/settings/members';

	// "View as colleague": an admin previews the app with fewer entitlements.
	// Offered to whoever really holds `admin` (`auth.canViewAs`).
	let viewAsOpen = $state(false);

	// A page naming itself from fetched data (usePageTitle) names the last crumb:
	// a declared trail's last crumb, else the title the rail shows.
	const title = $derived(dynamicPageTitle() ?? page.data.title);
	const breadcrumbs = $derived.by(() => {
		const declared = page.data.breadcrumbs;
		const named = dynamicPageTitle();
		if (!named || !declared?.length) return declared;
		return [...declared.slice(0, -1), { ...declared.at(-1)!, label: named }];
	});

	const accountLinks = $derived([
		...(auth.canViewAs
			? [{ label: 'View as colleague', icon: Eye, onSelect: () => (viewAsOpen = true) }]
			: []),
		...(shell.accountLinks ?? [])
			.filter((link) => !link.admin || auth.can('admin'))
			.map((link) => ({
				label: link.label,
				icon: link.icon,
				onSelect: () => goto(link.href)
			}))
	]);
</script>

{#snippet brandMark()}
	{@const Mark = shell.brand.mark}
	{#if Mark}<Mark class="size-6" />{/if}
{/snippet}

<AppShell
	{nav}
	bind:collapsed
	brandTitle={shell.brand.title}
	brandMark={shell.brand.mark ? brandMark : undefined}
	homeHref={shell.brand.homeHref}
	currentPath={page.url.pathname}
	pageType={page.data.pageType}
	{title}
	{breadcrumbs}
	onSearch={() => (paletteOpen = true)}
>
	<!-- The workspace switch, for whoever has more than one to switch between —
	     renders nothing for an org-of-one (see workspace-menu.svelte). The
	     factory owns the component; this is where the app mounts it, named by
	     `shell.workspaceLabel`. -->
	{#snippet context()}
		<WorkspaceMenu {membersHref} label={shell.workspaceLabel} />
	{/snippet}

	<!-- The bell (app-factory docs/design/alerts.md), admin-gated by the component itself. -->
	{#snippet actions()}
		<AdminAlertBell />
	{/snippet}

	<!-- Who is signed in, and the way out — rendered once, at the end of the
	     top bar (rules-library/platform/authentication.md §Frontend Auth Store
	     Contract). Waits for auth.user rather than passing it a null one; the
	     loading and workspace-choice states still get full shell chrome, just
	     not yet an avatar. onAccountSettings is the Settings item, the one door
	     to /settings: the rail has no row for it, and sign out lives here only.

	     onManageMembers is wired ONLY while WorkspaceMenu renders nothing for
	     this caller (one membership, `!auth.canSwitchWorkspace`): that menu
	     carries its own Members entry once there is a switch to go with it,
	     and giving both surfaces the same item at once is the same act listed
	     twice, not a second door (see workspace-menu.svelte). -->
	{#snippet identity()}
		{#if auth.user}
			<AppIdentity
				user={auth.user}
				workspace={auth.activeWorkspace?.name}
				role={auth.activeRole}
				entitlements={auth.entitlements}
				links={accountLinks}
				onManageMembers={auth.canSwitchWorkspace ? undefined : () => goto(membersHref)}
				onAccountSettings={() => goto('/settings')}
				onSignOut={() => void auth.logout()}
			/>
		{/if}
	{/snippet}

	<ViewAsBanner />
	{@render children()}
</AppShell>

<ViewAsDialog bind:open={viewAsOpen} />

<CommandPalette bind:open={paletteOpen} {nav} onNavigate={goto} />
