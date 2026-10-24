<script lang="ts">
	/**
	 * Registers this page's pane: the second column a `panel` page carries
	 * flush against the rail, as wide as the rail and folded as narrow as it,
	 * and opened from the bar as a sheet below 64rem of window. The shell draws
	 * it; this renders nothing where it stands (in place outside a shell).
	 *
	 *     <PagePane label="Past questions" icon={History} remember="chat-past-folded" fill>
	 *       {#snippet body({ mode, fold, close })}<ConversationList … />{/snippet}
	 *       {#snippet foot()}<Button …>Clear all</Button>{/snippet}
	 *       {#snippet folded({ unfold })}<Button … onclick={unfold}>…</Button>{/snippet}
	 *     </PagePane>
	 *
	 * The route declares `pageType: 'panel'`; the content beside the pane is the
	 * page itself. One registration at a time; a later one replaces an earlier.
	 */
	import type { Snippet } from 'svelte';
	import type { IconComponent } from './types.js';
	import { getPageSlots, IN_PLACE, type PageColumnState, type PagePaneRegistration } from './page.js';

	let {
		label,
		icon,
		location,
		remember,
		fill = false,
		column = $bindable(false),
		body,
		foot,
		folded
	}: {
		label: string;
		icon?: IconComponent;
		/** What the bar names on this page when the rail names nothing ("Settings › Account"). */
		location?: string;
		/** localStorage key the fold is remembered under. */
		remember?: string;
		/** The content beside the pane fills the frame (a transcript) instead of sitting at the panel measure. */
		fill?: boolean;
		/** True while the shell draws the pane as a column; false while it is a sheet. Bindable. */
		column?: boolean;
		body: Snippet<[PageColumnState]>;
		foot?: Snippet<[PageColumnState]>;
		/** The pane folded to its edge; given, the pane folds. */
		folded?: Snippet<[PageColumnState]>;
	} = $props();

	const slots = getPageSlots();

	$effect(() => {
		if (!slots) return;
		const registration: PagePaneRegistration = {
			label,
			icon,
			location,
			remember,
			fill,
			body,
			foot,
			folded,
			onmode: (mode) => (column = mode === 'column')
		};
		slots.pane = registration;
		return () => {
			if (slots.pane === registration) slots.pane = null;
		};
	});
</script>

{#if !slots}
	{@render body(IN_PLACE)}
	{@render foot?.(IN_PLACE)}
{/if}
