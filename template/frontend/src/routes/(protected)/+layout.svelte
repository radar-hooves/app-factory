<!--
	The signed-in app: the protected layout of strategy-authentication.md
	§Protected Layout. Every route under (protected)/ renders inside this app's
	own frame ($lib/app-frame.svelte: the rail, the top bar, the palette) and
	behind the session guard below, so a route the factory stamps here needs no
	move to reach either (app-factory#6). A URL no route serves lands here too,
	through the catch-all and +error.svelte beside this file. A route that must
	render without a session, such as a no-access page, lives outside
	(protected)/.

	The frame is the app's; this file is the factory's, because what it does
	must be the same in every app: who is signed in, which workspace a request
	acts in, and that a page never renders until both are settled.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { Button } from '@poodle64/ui/button';
	import { ErrorState } from '@poodle64/ui/error-state';
	import { ReportWidget } from '@poodle64/ui/feedback';
	import { LoadingState } from '@poodle64/ui/loading-state';
	import { page } from '$app/state';
	import { redirectToAuthentik } from '$lib/api';
	import AppFrame, { workspaceLabel } from '$lib/app-frame.svelte';
	import { auth } from '$lib/auth.svelte';
	import WorkspaceChooser from '$lib/workspaces/workspace-chooser.svelte';

	let { children }: { children: Snippet } = $props();

	// Load the caller and their workspace memberships once
	// (rules-library/platform/authentication.md §Frontend Auth Store Contract).
	// It resolves which workspace every subsequent request acts in, so it runs
	// here rather than per-route — and the page below is NOT rendered until it
	// has settled: a page that fetched first would send no workspace header
	// and, for anyone holding two memberships, be answered 409. Once per page
	// load, not per mount: a route outside (protected)/ unmounts this layout, and
	// coming back must not flash the loading state or ask again.
	onMount(() => {
		if (auth.isLoading) void auth.init();
	});

	// The lapsed-session guard. Tier 1a has no login page: the forward-auth
	// proxy authenticates before the SPA loads, so a session that lapsed since
	// goes back to the identity provider for the page it asked for. Only a
	// lapsed one (auth.svelte.ts's `SignInFailure`): a backend that is down
	// would answer the round trip with the same failure, and loop.
	$effect(() => {
		if (auth.failure === 'lapsed') {
			redirectToAuthentik(page.url.pathname + page.url.search);
		}
	});
</script>

<AppFrame>
	{#if auth.isLoading || auth.failure === 'lapsed'}
		<LoadingState />
	{:else if !auth.isAuthenticated}
		<ErrorState message="Could not load your account, so this page cannot open yet.">
			{#snippet action()}
				<Button variant="outline" onclick={() => void auth.init()}>Try again</Button>
			{/snippet}
		</ErrorState>
	{:else if auth.needsWorkspaceChoice}
		<!-- Several workspaces and none chosen: a choice, never a silent default. -->
		<WorkspaceChooser label={workspaceLabel} />
	{:else}
		<!-- Keyed on the workspace, so switching remounts the page and it fetches
		     again. A page therefore never has to know a switch happened, and can
		     never keep showing the previous workspace's rows. -->
		{#key auth.activeWorkspace?.id}
			{@render children()}
		{/key}
	{/if}
</AppFrame>

<!-- The feedback widget, for whoever is actually signed in — there is nobody
     to attribute a report to before then. The endpoint is named because the
     widget's own default, /api/feedback, is not the route: the router serves
     /api/feedback/, and the SPA's static mount at / answers the slashless POST
     with a 405 before any redirect could add the slash (master-project#335). -->
{#if auth.user}
	<ReportWidget endpoint="/api/feedback/" />
{/if}
