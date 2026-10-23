<!--
	Shown for as long as an admin is previewing the app as a colleague, and the
	way back. Renders from `viewingAs` alone: the admin entitlement may itself be
	narrowed away, so nothing else in the frame can offer the exit.
-->
<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import { Alert } from '@poodle64/ui/alert';
	import { Button } from '@poodle64/ui/button';
	import { auth } from '$lib/auth.svelte';
	import { reloadPage } from './reload';

	function stop() {
		auth.stopViewingAs();
		reloadPage();
	}
</script>

{#if auth.viewingAs}
	<Alert variant="warning" class="mb-4 flex items-center gap-3 py-2" data-testid="view-as-banner">
		<Eye />
		<span class="flex-1"
			>Viewing as a colleague, with {auth.entitlements.length} of your {auth.held.length} entitlements.</span
		>
		<Button size="sm" variant="outline" onclick={stop}>Stop viewing as colleague</Button>
	</Alert>
{/if}
