<script lang="ts">
	import type { Snippet } from 'svelte';
	import StatList from '../stat-list/stat-list.svelte';
	import type { StatItem } from '../stat-list/stat-list.svelte';
	import Panel from '../panel/panel.svelte';
	import * as Tooltip from '../tooltip/index.js';
	import IconAction from '../list-toolbar/icon-action.svelte';
	import PageAside from '../app-shell/page-aside.svelte';
	import X from '@lucide/svelte/icons/x';

	// The page's context, in one of two forms, as the page's aside: the shell
	// places it by the route's page type (`PageAside`), at a tool page's right
	// edge or opened from the bar as a sheet below 80rem of window, so this sets
	// no width and no breakpoint of its own.
	//
	// A list page's: one standing "At a glance" stat card and, beneath it, a
	// Find or the selected row's detail (the `detail` snippet). The stat card
	// stays put; the detail flows in on select and leaves on deselect, so the
	// column never changes shape.
	//
	// A record page's (`title` and `children`): the one item the page has
	// opened, a card with its title and a close button whose body scrolls
	// inside it. A click elsewhere on the page swaps it, and it is never empty:
	// the page opens it on what needs the viewer first, and a close reopens
	// that. An opened item's document (`documentPane`, a DocumentPane) takes
	// the item's place.
	type ListForm = {
		stats: StatItem[];
		statsTitle?: string;
		statsInfo?: string;
		detail?: Snippet;
		title?: never;
		subtitle?: never;
		onClose?: never;
		children?: never;
		documentPane?: never;
	};
	type RecordForm = {
		/** The opened item's name. */
		title: string;
		/** One line under it: why it is the one open. */
		subtitle?: string;
		/** Shows a close button. Reopen what needs the viewer: the column is never empty. */
		onClose?: () => void;
		/** The opened item. */
		children: Snippet;
		/** The opened item's document: a DocumentPane, in the item's place. */
		documentPane?: Snippet;
		stats?: never;
		statsTitle?: never;
		statsInfo?: never;
		detail?: never;
	};

	let {
		stats,
		statsTitle = 'At a glance',
		statsInfo,
		detail,
		title,
		subtitle,
		onClose,
		children,
		documentPane,
		/** The column's name: its landmark's, its opener's and its sheet's.
		    Defaults to the opened item's title, else the stat card's. */
		ariaLabel
	}: (ListForm | RecordForm) & { ariaLabel?: string } = $props();

	const name = $derived(ariaLabel ?? title ?? statsTitle);
	/** The sheet's title is the body's own heading, so the body leaves it to the sheet. */
	const headed = $derived(name === (children ? title : statsTitle));
</script>

{#snippet close()}
	<Tooltip.Provider delayDuration={150}>
		<IconAction action={{ label: `Close ${title}`, icon: X, onclick: onClose }} />
	</Tooltip.Provider>
{/snippet}

<!-- In the sheet the header names the column, so a body headed by the same
     name leaves its heading to it, and the line under the heading goes with it. -->
<PageAside label={name} description={headed ? (children ? subtitle : statsInfo) : undefined}>
	{#snippet body(state)}
		{@const framed = state.mode === 'sheet' && headed}
		<div class="flex min-h-0 flex-1 flex-col gap-5" data-slot="context-column">
			{#if children}
				{#if documentPane}
					{@render documentPane()}
				{:else}
					{#key title}
						<Panel
							title={framed ? undefined : title}
							subtitle={framed ? undefined : subtitle}
							action={onClose && !framed ? close : undefined}
							pad={false}
							scroll
							class="max-h-full min-h-0"
							data-slot="context-column-item"
						>
							{@render children?.()}
						</Panel>
					{/key}
				{/if}
			{:else}
				<StatList items={stats ?? []} title={statsTitle} info={statsInfo} bare={framed} />
				{#if detail}
					{@render detail()}
				{/if}
			{/if}
		</div>
	{/snippet}
</PageAside>
