<script lang="ts">
	/**
	 * Registers this page's aside: what stands beside the page's content. The
	 * shell places it by the route's page type: in a `reading` page beside the
	 * centred column, the pair centred, and after the column below 66rem of
	 * content region; in a `tool` or `panel` page at the frame's right edge,
	 * opened from the bar as a sheet below 80rem of window. Renders nothing
	 * where it stands (in place outside a shell).
	 *
	 *     <PageAside label="Work under way">
	 *       <Panel title="Work under way">…</Panel>
	 *     </PageAside>
	 *
	 * The body takes the column's state when it needs it (`{#snippet body(state)}`
	 * instead of children), to close the sheet after a choice. One registration
	 * at a time; a later one replaces an earlier one.
	 */
	import type { Snippet } from 'svelte';
	import type { IconComponent } from './types.js';
	import { getPageSlots, IN_PLACE, type PageAsideRegistration, type PageColumnState } from './page.js';

	let {
		label,
		description,
		icon,
		body,
		children
	}: {
		label: string;
		/** A line under the name at the head of the sheet. */
		description?: string;
		icon?: IconComponent;
		body?: Snippet<[PageColumnState]>;
		children?: Snippet;
	} = $props();

	const slots = getPageSlots();

	$effect(() => {
		if (!slots) return;
		const content = body ?? children;
		if (!content) return;
		const registration: PageAsideRegistration = {
			label,
			description,
			icon,
			body: content as Snippet<[PageColumnState]>
		};
		slots.aside = registration;
		return () => {
			if (slots.aside === registration) slots.aside = null;
		};
	});
</script>

{#if !slots}
	{#if body}{@render body(IN_PLACE)}{:else}{@render children?.()}{/if}
{/if}
