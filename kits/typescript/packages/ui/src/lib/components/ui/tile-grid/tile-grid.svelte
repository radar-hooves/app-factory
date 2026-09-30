<script lang="ts">
	/**
	 * A tile grid that gains columns as its container grows.
	 *
	 * A fixed column count (`sm:grid-cols-2`) cannot use width — it can only
	 * stretch, so widening the container makes an index worse rather than better:
	 * two columns of very wide rows, each with its chevron marooned at the far
	 * edge.
	 *
	 * `auto-fill` + `minmax(min, 1fr)` is the media-library answer (Jellyfin,
	 * Plex): the browser fits as many whole tiles as the width allows and
	 * distributes the remainder, so one declaration covers a phone (one column)
	 * and a 4K panel (seven or eight) with nothing in between to maintain and no
	 * breakpoint list to keep in sync across pages.
	 *
	 * `min` is the narrowest a tile may get before a column is dropped, and it is
	 * the only sizing knob: a denser index passes a smaller one. Tiles stay the
	 * caller's business — this owns the track sizing and nothing else, which is
	 * what lets one grid serve topics, collections, documents and modules.
	 *
	 * `min`/`gap` are raw CSS lengths rather than named tokens on purpose: track
	 * density is a per-index layout decision that varies by call site, not a
	 * single themeable value the palette should carry.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		min = '16rem',
		gap = '0.75rem',
		tag = 'div',
		class: className,
		ref = $bindable(null),
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		/** Narrowest a tile may be before a column is dropped. A raw CSS length. */
		min?: string;
		/** Gap between tiles. A raw CSS length. */
		gap?: string;
		/**
		 * The element to render. Pass `ul` where the tiles are a list of links
		 * (with `li` children), so making an index responsive does not quietly
		 * cost it its list semantics — the count a screen reader announces on
		 * entry.
		 */
		tag?: 'div' | 'ul';
		children: Snippet;
	} = $props();
</script>

<!-- `min()` guards the narrow end: a bare `minmax(16rem, 1fr)` track cannot go
     below its minimum, so at 360px the row would overflow the viewport rather
     than fall to one column. This is the property that silently regresses if the
     wrapper is dropped, so the test asserts it explicitly. -->
<svelte:element
	this={tag}
	bind:this={ref}
	data-slot="tile-grid"
	{...restProps}
	class={cn('grid', className)}
	style="grid-template-columns: repeat(auto-fill, minmax(min({min}, 100%), 1fr)); gap: {gap};"
>
	{@render children()}
</svelte:element>
