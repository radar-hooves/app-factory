<script lang="ts" module>
	/** One step of the trail. With `href` it is a way back; without, it is where you are. */
	export type BreadcrumbItem = { label: string; href?: string };
</script>

<script lang="ts">
	/**
	 * Where you are, as a trail of the routes above it. Three apps had written
	 * this by hand (one copy three times, one as a 28-call-site wrapper, one with
	 * slash separators), and none named the landmark, so a screen reader met an
	 * unlabelled list of links.
	 *
	 * The links are plain `<a href>`: SvelteKit routes them client-side, so a
	 * package with no router of its own can still render the app's routes, as
	 * AppNav does for `NavItem.href`.
	 *
	 * The trail never wraps. Each step truncates instead, ancestors twice as
	 * readily as where you are, so one long collection name gives way first on
	 * a phone and shows in full wherever there is room.
	 */
	import type { HTMLAttributes } from 'svelte/elements';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		items,
		label = 'Breadcrumb',
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		items: BreadcrumbItem[];
		/** The landmark's accessible name. */
		label?: string;
	} = $props();
</script>

<nav
	bind:this={ref}
	aria-label={label}
	data-slot="breadcrumbs"
	class={cn('text-muted-foreground min-w-0 text-sm', className)}
	{...restProps}
>
	<ol class="flex min-w-0 items-center gap-1.5">
		{#each items as item, i (i)}
			{@const last = i === items.length - 1}
			<li class={cn('flex min-w-0 items-center gap-1.5', !last && 'shrink-[2]')}>
				{#if i > 0}
					<ChevronRight class="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
				{/if}
				{#if item.href}
					<a
						href={item.href}
						class="hover:text-foreground focus-visible:ring-ring/50 min-w-0 truncate rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3"
						>{item.label}</a
					>
				{:else}
					<span
						class="text-foreground min-w-0 truncate"
						aria-current={last ? 'page' : undefined}>{item.label}</span
					>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
