<!--
	Where the rail's Settings row and the account menu land: straight on to the
	first settings page this caller can open. A caller who can open none (no
	admin entitlement, in an app with no settings of its own yet) is told so,
	rather than shown an empty pane.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { EmptyState } from '@poodle64/ui/empty-state';
	import { firstSettingsHref, settingsSections } from '$lib/settings/sections';

	const first = $derived(firstSettingsHref(settingsSections()));

	$effect(() => {
		if (first) void goto(first, { replaceState: true });
	});
</script>

{#if !first}
	<EmptyState
		title="Nothing to set here"
		description="There are no settings in this app you can change."
	/>
{/if}
