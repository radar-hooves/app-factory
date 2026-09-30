<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	/**
	 * A card title is not always a heading, so the default stays upstream
	 * shadcn's `<div>`: a card whose title merely labels a figure would put a
	 * phantom stop in the document outline, and a component cannot know which
	 * kind it is being used as. Only the call site knows, so `level` is where it
	 * says so — and then this is a real `<h1>`–`<h6>`.
	 *
	 * Omitting it changes nothing. That default is also what made the loss
	 * invisible: the app this component replaced an `<h3>` in has dozens of card
	 * titles that genuinely ARE the heading for their card's content, on pages
	 * whose only other landmark is the page `<h1>`. Migrating onto this package
	 * left those pages with an h1 and then nothing — one stop for an entire admin
	 * dashboard when navigating by heading — with no error, no lint hit and no
	 * visual difference to notice it by. Every app adopting this inherits the
	 * same silence, which is why the escape hatch has to exist rather than the
	 * consumer being told to hand-roll its own title.
	 *
	 * `level` is the heading LEVEL, never a size: the class list is identical in
	 * both branches, so choosing `level={2}` moves the outline and not a single
	 * pixel. Sizing stays where it already is, on `class`.
	 */
	let {
		ref = $bindable(null),
		class: className,
		level,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		level?: 1 | 2 | 3 | 4 | 5 | 6;
	} = $props();
</script>

<!--
	One element expression rather than two branches. The requirement is that a
	heading render byte-identically to the div, and the cheapest way to guarantee
	that is to leave nowhere for the two to drift apart: the class list, the slot
	marker and the rest props are written once and the tag name is the only thing
	`level` touches.
-->
<svelte:element
	this={level ? `h${level}` : 'div'}
	bind:this={ref}
	data-slot="card-title"
	class={cn('text-base leading-snug font-medium group-data-[size=sm]/card:text-sm', className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
