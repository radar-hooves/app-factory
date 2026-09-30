<script lang="ts">
	/**
	 * The settings destination: a grouped section list beside the section you are
	 * reading, inside AppShell's content area.
	 *
	 * Two PANES, not a panel and not a drawer. The distinction is load-bearing:
	 * a panel overlays and closes, and this package carries a standing directive
	 * against side panels for work you are actually doing. These panes divide and
	 * persist, each scrolling on its own, so a long settings page never pushes the
	 * section list out of reach.
	 *
	 * The list renders through AppNav rather than a row renderer of its own, and
	 * that is the whole reason this component is small. AppNav already owns the
	 * group eyebrow, the active row's leading edge and tint and weight, the
	 * `aria-current="page"`, the segment-safe prefix match, truncation, and the
	 * density ramp — and it is exported in its own right precisely so a navigation
	 * list that belongs in a PAGE is built from the same affordance rather than
	 * hand-copied. The estate has already paid for the alternative once: one app's
	 * inner nav had reimplemented the active indicator independently of its own
	 * top bar. A second row renderer here would re-commit that drift one
	 * destination down, on the one surface every app is about to adopt at once.
	 *
	 * Grouping is by WHOSE setting it is — the person's, then the workspace's —
	 * because that is the only split a reader can predict: "yours" changes what
	 * you see, "this company" changes what everyone sees. A group whose `items`
	 * is empty renders nothing (`toGroups` drops it), so an app with no personal
	 * sections yet can leave the group in its list rather than stubbing a row that
	 * leads nowhere.
	 *
	 * One label per row, nothing beneath it. A description long enough to be worth
	 * reading does not fit a 240px column: every one of them truncated to an
	 * ellipsis and told the reader less than the label already did (measured
	 * 16/09/2026 in a consumer, removed there the same day). The page introduces
	 * its own sections — that is what Panel's `description` is for.
	 *
	 * No "Settings" heading. The shell's bar names the section it is on as of
	 * 2026.9.16, so a heading here is the same word twice, one above the other.
	 *
	 * BELOW md the list STACKS above the content and the page scrolls as one.
	 * A horizontally scrollable strip of the same rows was the obvious
	 * alternative and loses on the requirement it was meant to serve — every
	 * section reachable in one tap. A strip fits about two and a half rows at
	 * 375px, so the rest are behind a sideways swipe with no scrollbar to
	 * advertise them: a swipe THEN a tap, where a stack is a scroll the reader is
	 * already doing. It also has to drop the group labels for width, which throws
	 * away the one split the reader could predict, and it needs a second row
	 * renderer in a horizontal mode — the drift this component exists to avoid.
	 *
	 * USE IT WITH `padded={false}` on AppShell. The list's border and tint have to
	 * reach the content area's edges or the two panes read as a floating card, and
	 * this component pads its own content pane to the shell's own rhythm
	 * (`CONTENT_PADDING`) so the settings destination is not the one route whose
	 * text sits somewhere else.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import AppNav from '../app-shell/app-nav.svelte';
	import { CONTENT_PADDING } from '../app-shell/padding.js';
	import type { NavSource } from '../app-shell/types.js';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		sections,
		currentPath,
		listLabel = 'Settings sections',
		children,
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/**
		 * The sections, as the package's own navigation vocabulary: groups of
		 * `NavItem` (`{ heading, items }`), bare items, or a mix. The same type the
		 * rail takes, so a row is the same row everywhere in the household and an
		 * app types its settings list against something it already has.
		 *
		 * A row at the settings ROOT (`/settings`) needs `exact: true`, or its
		 * prefix match keeps it lit on every section beneath it alongside the
		 * section's own row.
		 */
		sections: NavSource;
		/** The active path. Apps pass `page.url.pathname`, as they do to AppShell. */
		currentPath?: string;
		/** The list's accessible name. */
		listLabel?: string;
		children: Snippet;
	} = $props();
</script>

<div bind:this={ref} class={cn('ds-settings', className)} {...restProps}>
	<!--
		Width, tint and rule as utilities rather than in styles.css, because AppNav
		declares `flex-1` on this same element: a base-layer `flex: none` loses to
		a utility by layer, whatever order it is written in, while a utility passed
		through `cn()` is resolved by tailwind-merge — `flex-none` and `flex-1` are
		one group, so the last one wins and it is this one.

		15rem (240px) is measured, not picked: it is the width at which a
		two-word section label ("Overhead suppliers", "Delegation limits") sits on
		one line beside its icon at comfortable density.
	-->
	<AppNav
		nav={sections}
		{currentPath}
		label={listLabel}
		class="border-border bg-muted/30 flex-none border-b md:w-60 md:border-b-0 md:border-e"
	/>
	<div class={cn('ds-settings-pane', CONTENT_PADDING)}>
		{@render children()}
	</div>
</div>
