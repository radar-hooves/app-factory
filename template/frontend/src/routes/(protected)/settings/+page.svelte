<!--
	Where the rail's Settings row and the account menu land: straight on to the
	first settings page this caller can open. A caller who can open none (no
	admin entitlement, in an app with no settings of its own yet) is told so,
	rather than shown an empty pane.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { EmptyState } from '@poodle64/ui/empty-state';
	import { firstSettingsHref, settingsSections } from '$lib/settings/sections';

	const first = $derived(firstSettingsHref(settingsSections()));

	// A navigation or an invalidation that starts while this redirect loads
	// takes the router's token and drops it, and the page stays here (caspo's
	// E2E stayed on /settings in two runs of three). So it asks again, but only
	// while this page is still the one shown at its own path and nothing else is
	// navigating: a link the reader followed meanwhile wins, and a redirect
	// something cancelled stays cancelled.
	const TRIES = 3;
	$effect(() => {
		if (!first) return;
		const target = first;
		const here = page.url.pathname;
		let shown = true;
		void (async () => {
			for (let n = 0; n < TRIES; n++) {
				if (n > 0 && (!shown || navigating.to || page.url.pathname !== here)) return;
				try {
					await goto(target, { replaceState: true });
				} catch {
					return;
				}
			}
		})();
		return () => {
			shown = false;
		};
	});
</script>

{#if !first}
	<EmptyState
		title="Nothing to set here"
		description="There are no settings in this app you can change."
	/>
{/if}
