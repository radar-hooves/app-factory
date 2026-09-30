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

	const missing = $derived(page.status === 404);
</script>

<EmptyState
	title={missing ? 'Page not found' : 'This page could not open'}
	description={missing
		? 'Nothing in this app lives at that address.'
		: (page.error?.message ?? 'Something went wrong.')}
>
	{#snippet action()}
		<Button variant="outline" href="/">Go home</Button>
	{/snippet}
</EmptyState>
