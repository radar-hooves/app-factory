<!--
	The signed-in app. Every route under (app)/ renders inside this app's own
	frame ($lib/app-frame.svelte: the rail, the top bar, the palette) and behind
	the session guard below, so a route the factory stamps here needs no move to
	reach either (app-factory#6). A route that must render without a session
	lives outside (app)/.

	The frame is the app's; this file is the factory's, because what it does
	must be the same in every app: who is signed in, which workspace a request
	acts in, and that a page never renders until both are settled.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { ReportWidget } from '@poodle64/ui/feedback';
	import { LoadingState } from '@poodle64/ui/loading-state';
	import { page } from '$app/state';
	import { redirectToAuthentik } from '$lib/api';
	import AppFrame from '$lib/app-frame.svelte';
	import { auth } from '$lib/auth.svelte';
	import WorkspaceChooser from '$lib/workspaces/workspace-chooser.svelte';

	let { children }: { children: Snippet } = $props();

	// Load the caller and their workspace memberships once
	// (rules-library/platform/authentication.md §Frontend Auth Store Contract).
	// It resolves which workspace every subsequent request acts in, so it runs
	// here rather than per-route — and the page below is NOT rendered until it
	// has settled: a page that fetched first would send no workspace header
	// and, for anyone holding two memberships, be answered 409.
	onMount(() => {
		void auth.init();
	});

	// The lapsed-session guard. Tier 1a has no login page: the forward-auth
	// proxy authenticates before the SPA loads, so a caller who is not signed in
	// here is one whose session lapsed, and they go back to the identity
	// provider for the page they asked for. A lapsed session reaches the SPA as
	// a failed request, never a 401: the proxy answers it with a redirect to the
	// identity provider, which a fetch cannot follow. So this reads the outcome
	// of init(), not a status code.
	$effect(() => {
		if (!auth.isLoading && !auth.isAuthenticated) {
			redirectToAuthentik(page.url.pathname + page.url.search);
		}
	});
</script>

<AppFrame>
	{#if auth.isLoading || !auth.isAuthenticated}
		<LoadingState />
	{:else if auth.needsWorkspaceChoice}
		<!-- Several workspaces and none chosen: a choice, never a silent default. -->
		<WorkspaceChooser />
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
     to attribute a report to before then. -->
{#if auth.user}
	<ReportWidget />
{/if}
