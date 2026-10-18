<script lang="ts">
	/**
	 * A section of a page, under its PageHeader: a heading, an optional line of
	 * explanation, trailing actions, and the section's content at one distance
	 * below them.
	 *
	 * One app had five recipes for this one role, from an 11px uppercase kicker
	 * to a 20px display heading, and each page spaced its content from the
	 * heading differently. The heading and the gap under it are this
	 * component's, because those are the halves that drift.
	 *
	 * Level 2 is a section, in the display face one step under the page title.
	 * Level 3 is a subsection, in the body face at a Panel title's size, so a
	 * titled card and a subsection read as the same rank. There is no uppercase
	 * kicker form: a small caps label above content is the column head of a
	 * table or a nav group, never a heading.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		title,
		level = 2,
		description,
		count,
		actions,
		children,
		id,
		ref = $bindable(null),
		class: className,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLElement>>, 'title'> & {
		title: string;
		/** 2, a section of the page; 3, a section within one. */
		level?: 2 | 3;
		/** A sentence or two under the heading. It wraps. */
		description?: string;
		/** How many things the section holds, set beside the heading. */
		count?: number;
		/** Controls for the section, trailing the heading. */
		actions?: Snippet;
		children?: Snippet;
		/** The heading's id, for a link to the section. One is generated otherwise. */
		id?: string;
	} = $props();

	const fallbackId = $props.id();
	const headingId = $derived(id ?? `section-${fallbackId}`);
</script>

<section
	bind:this={ref}
	aria-labelledby={headingId}
	data-slot="page-section"
	class={cn('flex min-w-0 flex-col', level === 2 ? 'gap-4' : 'gap-3', className)}
	{...restProps}
>
	<header
		class={cn(
			'flex min-w-0 flex-wrap justify-between gap-x-4 gap-y-2',
			description ? 'items-start' : 'items-center'
		)}
	>
		<div class="min-w-0">
			<svelte:element
				this={`h${level}`}
				id={headingId}
				class={cn(
					'flex min-w-0 items-baseline gap-2 scroll-mt-4 font-semibold',
					level === 2
						? 'font-display text-section tracking-[var(--ds-font-display-tracking,-0.015em)]'
						: 'text-body leading-tight tracking-tight'
				)}
			>
				<span class="min-w-0">{title}</span>
				{#if count !== undefined}
					<span
						class="text-muted-foreground font-sans text-sm font-normal tracking-normal tabular-nums"
						>{count}</span
					>
				{/if}
			</svelte:element>
			{#if description}
				<p class="text-muted-foreground ds-measure mt-1 text-sm" data-measure="prose">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="flex min-w-0 flex-wrap items-center justify-end gap-2">{@render actions()}</div>
		{/if}
	</header>
	{@render children?.()}
</section>
