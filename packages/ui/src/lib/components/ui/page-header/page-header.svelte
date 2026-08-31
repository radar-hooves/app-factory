<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import InfoTip from '../info-tip/info-tip.svelte';

	/**
	 * The one page-title pattern for every route. `subtitle` is a short, single
	 * line that never wraps (line-clamp-1); reserve longer explanation for `info`,
	 * which renders an (i) tooltip beside the title, so the page never carries a
	 * standing explainer banner.
	 *
	 * `title` is optional, and that is a deliberate widening rather than an
	 * oversight. One adopting app could not use this component at all: 19 of its
	 * 22 page headers carry breadcrumbs and 15 have no title, because its page
	 * header IS a breadcrumb bar with actions on the right. A component that
	 * insists on a title excludes that shape entirely.
	 *
	 * It grew a breadcrumb slot rather than becoming a second component. A
	 * separate `BreadcrumbHeader` would have had to re-implement the actions row,
	 * the eyebrow, the info tip and the spacing, and every app would then face a
	 * choice between two page headers that must not drift — which is precisely
	 * the drift this package exists to end. One component, one spacing rhythm,
	 * two shapes.
	 *
	 * The trail itself stays the app's, as a snippet: a breadcrumb trail is made
	 * of routed links, and a package with no SvelteKit runtime of its own cannot
	 * own those (the same reasoning that makes AppShell take `currentPath` as a
	 * prop rather than importing `$app/state`).
	 *
	 * `icon` and `meta` are snippets for the same reason and earn their place the
	 * same way `breadcrumbs` did: three apps had hand-rolled the meta row and two
	 * the icon square, one of them across 38 of its 49 page headers in a full
	 * local reimplementation of this component. The app supplies the GLYPH and
	 * the ITEMS; the package owns the treatment — the tinted square, its size,
	 * and the row's spacing — because the treatment is the half that drifts.
	 */
	let {
		eyebrow,
		breadcrumbs,
		icon,
		title,
		subtitle,
		info,
		meta,
		actions,
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** A short kicker above the title. Use this OR `breadcrumbs`, not both. */
		eyebrow?: string;
		/** The trail above the title — the app's own routed links. */
		breadcrumbs?: Snippet;
		/** The glyph alone. The tinted square around it is this component's. */
		icon?: Snippet;
		/** Omit for a header that is a breadcrumb bar with actions. */
		title?: string;
		subtitle?: string;
		info?: string;
		/** Facts about the page, under the title: badges, dates, a status. */
		meta?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<div
	bind:this={ref}
	class={cn('mb-6 flex flex-wrap items-start justify-between gap-4', className)}
	{...restProps}
>
	<div class="flex min-w-0 items-start gap-3">
		{#if icon}
			<!-- aria-hidden: the glyph restates the title beside it, so a reader
			     already has the fact. `shrink-0` so it never collapses when the
			     title is long, and the square is the package's rather than the
			     app's precisely so two apps cannot pick two sizes for it. -->
			<span
				class="bg-primary/10 text-primary mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5"
				aria-hidden="true"
			>
				{@render icon()}
			</span>
		{/if}
		<div class="min-w-0">
			{#if breadcrumbs}
				<div class="text-muted-foreground mb-1.5 flex min-w-0 items-center text-sm">
					{@render breadcrumbs()}
				</div>
			{/if}
			{#if eyebrow}
				<div class="text-primary text-2xs tracking-eyebrow mb-1 font-medium uppercase">
					{eyebrow}
				</div>
			{/if}
			{#if title}
				<div class="flex items-center gap-2">
					<h1 class="font-display text-display leading-tight font-semibold tracking-[-0.02em]">
						{title}
					</h1>
					{#if info}
						<InfoTip
							text={info}
							class="text-muted-foreground/50 hover:text-muted-foreground mt-0.5 size-4 transition-colors"
						/>
					{/if}
				</div>
			{:else if info}
				<!-- Title-less, but the page still has something to explain. The tip
				     keeps a row of its own rather than being dropped along with the
				     heading it usually sits beside. -->
				<div class="flex items-center gap-2">
					<InfoTip
						text={info}
						class="text-muted-foreground/50 hover:text-muted-foreground size-4 transition-colors"
					/>
				</div>
			{/if}
			{#if subtitle}
				<p class="text-muted-foreground mt-1.5 line-clamp-1 max-w-4xl text-sm">{subtitle}</p>
			{/if}
			{#if meta}
				<!-- `min-w-0` for the reason the actions row carries it: this is a flex
				     item and would otherwise floor at its own min-content width, which
				     wrapping cannot get below. -->
				<div
					class="text-muted-foreground mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-xs"
				>
					{@render meta()}
				</div>
			{/if}
		</div>
	</div>
	{#if actions}
		<!--
			`min-w-0` is load-bearing, not tidying. This row is a flex ITEM of the
			header, so it inherits `min-width: auto` — a floor at its own min-content
			width, which its `flex-wrap` cannot get below because wrapping shrinks a
			flex CONTAINER, never its item floor. Measured 2026-08-20 at 360px: an
			actions row rendered 408px inside a 328px parent and pushed 64px of
			sideways scroll into the shell content region, on every consumer using
			PageHeader with actions.
		-->
		<div class="flex min-w-0 flex-wrap items-center justify-end gap-2">{@render actions()}</div>
	{/if}
</div>
