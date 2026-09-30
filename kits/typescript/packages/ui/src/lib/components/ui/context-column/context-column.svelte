<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import StatList from '../stat-list/stat-list.svelte';
	import type { StatItem } from '../stat-list/stat-list.svelte';
	import AppDialog from '../app-dialog/app-dialog.svelte';
	import PanelRight from '@lucide/svelte/icons/panel-right';

	// The persistent right-hand context column, identical on every route. It holds
	// one standing "At a glance" stat card and, on routes with a selectable table,
	// the selected-row detail beneath it (a DetailPanel passed as the `detail`
	// snippet). The stat card stays put; the detail flows in on select and leaves
	// on deselect, so the column never changes shape.
	//
	// Width is clamped (shared-design-language §6) so a wide screen earns
	// information, not emptiness. The column is a flex child of the page body row;
	// the stat card is shrink-0 and any detail takes the remaining height with its
	// own inner scroll.
	//
	// Below xl (1280px) a fixed nav rail plus a ~400px column would crush the
	// primary pane, so the standing `<aside>` stays hidden there — but its content
	// does not vanish with it. A floating trigger opens the identical stats/detail
	// pair in a dialogue instead: the column's shape is a desktop affordance, the
	// information inside it is not.
	let {
		stats,
		statsTitle = 'At a glance',
		statsInfo,
		detail,
		/** The landmark's accessible name. `<aside>` with no name is exposed as
		    "complementary" alone — set this to identify which one. */
		ariaLabel,
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		stats: StatItem[];
		statsTitle?: string;
		statsInfo?: string;
		detail?: Snippet;
		ariaLabel?: string;
	} = $props();

	let sheetOpen = $state(false);
</script>

{#snippet body()}
	<StatList items={stats} title={statsTitle} info={statsInfo} />
	{#if detail}
		{@render detail()}
	{/if}
{/snippet}

<aside
	bind:this={ref}
	aria-label={ariaLabel}
	class={cn(
		'hidden max-h-full min-h-0 w-[clamp(360px,28vw,460px)] shrink-0 flex-col gap-5 xl:flex',
		className
	)}
	{...restProps}
>
	{@render body()}
</aside>

<!-- The reachable stand-in below xl. `size-11` (44px) rather than this
     package's usual 36px control row: this is the one control whose entire
     job is making otherwise-unreachable content reachable, so it earns the
     full touch-target minimum rather than the shell's ordinary density. -->
<button
	type="button"
	onclick={() => (sheetOpen = true)}
	class="border-border bg-card text-muted-foreground hover:text-foreground ds-edge fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 grid size-11 flex-none place-items-center rounded-full border xl:hidden"
	aria-label={ariaLabel ? `Open ${ariaLabel}` : `Open ${statsTitle}`}
>
	<PanelRight class="size-4.5" />
</button>

<AppDialog bind:open={sheetOpen} title={ariaLabel ?? statsTitle} size="sm">
	<div class="flex flex-col gap-5">
		{@render body()}
	</div>
</AppDialog>
