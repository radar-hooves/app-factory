<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import StatList from '../stat-list/stat-list.svelte';
	import type { StatItem } from '../stat-list/stat-list.svelte';
	import AppDialog from '../app-dialog/app-dialog.svelte';
	import Panel from '../panel/panel.svelte';
	import * as Tooltip from '../tooltip/index.js';
	import IconAction from '../list-toolbar/icon-action.svelte';
	import PanelRight from '@lucide/svelte/icons/panel-right';
	import X from '@lucide/svelte/icons/x';

	// The persistent right-hand context column, identical on every route, in
	// one of two forms.
	//
	// A list page's: one standing "At a glance" stat card and, beneath it, a
	// Find or the selected row's detail (the `detail` snippet). The stat card
	// stays put; the detail flows in on select and leaves on deselect, so the
	// column never changes shape.
	//
	// A record page's (`title` and `children`): the one item the page has
	// opened, a card with its title and a close button whose body scrolls
	// inside it, as tall as what it holds up to the column. A click elsewhere
	// on the page swaps it, and it is never empty: the page opens it on what
	// needs the viewer first, and a close reopens that. An opened item's
	// document (`documentPane`, a DocumentPane) takes the column's place, and
	// stands beside it as a third pane once the page's row has room for three:
	// 1250px of row, which a 1600px screen gives with the rail open. The row,
	// not the screen, decides, so a folded rail or a narrow window is read
	// as the room the page actually has.
	//
	// Width is clamped (shared-design-language §6) so a wide screen earns
	// information, not emptiness. The column is a flex child of the page body row;
	// the stat card is shrink-0 and any detail takes the remaining height with its
	// own inner scroll.
	//
	// Below xl (1280px) a fixed nav rail plus a ~400px column would crush the
	// primary pane, so the standing `<aside>` stays hidden there — but its content
	// does not vanish with it. A floating trigger opens the identical content in a
	// dialogue instead: the column's shape is a desktop affordance, the
	// information inside it is not.
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
		/** The opened item's document: a DocumentPane, in the column's place or beside it. */
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
		/** The landmark's accessible name. `<aside>` with no name is exposed as
		    "complementary" alone — set this to identify which one. */
		ariaLabel,
		ref = $bindable(null),
		class: className,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLElement>>, 'title' | 'children'> &
		(ListForm | RecordForm) & { ariaLabel?: string } = $props();

	let sheetOpen = $state(false);
	/**
	 * The page row the column stands in, by its width; null until read, so a
	 * document is placed once rather than mounted in the column and moved.
	 * Crossing the threshold later moves it, opening it afresh.
	 */
	let row = $state<number | null>(null);
	$effect(() => {
		const parent = ref?.parentElement;
		if (!parent) return;
		row = parent.clientWidth;
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(([entry]) => (row = entry?.contentRect.width ?? 0));
		observer.observe(parent);
		return () => observer.disconnect();
	});
	/** Room for the document beside the column, not in its place. */
	const BESIDE = 1250;
	const beside = $derived(row !== null && row >= BESIDE);
	const name = $derived(ariaLabel ?? title ?? statsTitle);
</script>

{#snippet close()}
	<Tooltip.Provider delayDuration={150}>
		<IconAction action={{ label: `Close ${title}`, icon: X, onclick: onClose }} />
	</Tooltip.Provider>
{/snippet}

{#snippet item()}
	{#key title}
		<Panel
			{title}
			{subtitle}
			action={onClose ? close : undefined}
			pad={false}
			scroll
			class="max-h-full min-h-0"
			data-slot="context-column-item"
		>
			{@render children?.()}
		</Panel>
	{/key}
{/snippet}

{#snippet body()}
	{#if children}
		{#if documentPane && row !== null && !beside}{@render documentPane()}{:else}{@render item()}{/if}
	{:else}
		<StatList items={stats ?? []} title={statsTitle} info={statsInfo} />
		{#if detail}
			{@render detail()}
		{/if}
	{/if}
{/snippet}

<aside
	bind:this={ref}
	aria-label={ariaLabel ?? title}
	class={cn(
		'hidden max-h-full min-h-0 w-[clamp(360px,28vw,460px)] shrink-0 flex-col gap-5 xl:flex',
		className
	)}
	data-slot="context-column"
	{...restProps}
>
	{@render body()}
</aside>

{#if children && documentPane && beside}
	<div class="hidden min-h-0 min-w-0 flex-1 flex-col xl:flex" data-slot="context-column-document">
		{@render documentPane()}
	</div>
{/if}

<!-- The reachable stand-in below xl. `size-11` (44px) rather than this
     package's usual 36px control row: this is the one control whose entire
     job is making otherwise-unreachable content reachable, so it earns the
     full touch-target minimum rather than the shell's ordinary density. -->
<button
	type="button"
	onclick={() => (sheetOpen = true)}
	class="border-border bg-card text-muted-foreground hover:text-foreground ds-edge fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 grid size-11 flex-none place-items-center rounded-full border xl:hidden"
	aria-label="Open {name}"
>
	<PanelRight class="size-4.5" />
</button>

<AppDialog bind:open={sheetOpen} title={name} size="sm">
	<div class={cn('flex flex-col gap-5', children && documentPane && 'h-[70dvh]')}>
		{@render body()}
	</div>
</AppDialog>
