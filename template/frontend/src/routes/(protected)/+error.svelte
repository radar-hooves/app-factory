<!--
	What a signed-in route shows when it cannot: a URL nothing serves (the
	catch-all beside this file) or a load that threw. Under (protected)/, so it
	renders inside the app's frame and behind the session guard, with the rail
	still there to leave by; the root's own error page would have neither.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '@poodle64/ui/button';
	import { EmptyState } from '@poodle64/ui/empty-state';
	import * as app from '$lib/art';
	import type { StateArt } from '$lib/state-art';

	const art: StateArt = app;

	const missing = $derived(page.status === 404);
	const description = $derived(
		missing
			? 'Nothing in this app lives at that address.'
			: (page.error?.message ?? 'Something went wrong.')
	);
</script>

<div class="flex flex-col gap-4">
	{#if art.ErrorArt}
		<div class="flex justify-center">
			<art.ErrorArt status={page.status} message={description} />
		</div>
	{/if}
	<EmptyState title={missing ? 'Page not found' : 'This page could not open'} {description}>
		{#snippet action()}
			<Button variant="outline" href="/">Go home</Button>
		{/snippet}
	</EmptyState>
</div>
