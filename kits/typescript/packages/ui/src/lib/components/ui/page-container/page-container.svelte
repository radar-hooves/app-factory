<script lang="ts">
	/**
	 * A route's page: its header, sections and panels stacked at the one page
	 * rhythm. Pages had written that wrapper per file (`space-y-6`, `space-y-10`,
	 * `gap-4`, `gap-5`, `gap-10` in one app; a local PageContainer behind 56
	 * call sites in another).
	 *
	 * Width is not this component's: AppShell caps the content box from the
	 * route's `measure`, which a route declares in its load data. The container
	 * fills that box and grows to its height, so a page holding a board or a
	 * table can scroll inside itself.
	 *
	 * PageHeader carries its own bottom margin for pages written without this;
	 * inside it the gap alone spaces the header, so the header sits at the same
	 * distance either way.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		children,
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { children: Snippet } = $props();
</script>

<div
	bind:this={ref}
	data-slot="page-container"
	class={cn(
		'flex min-h-0 w-full min-w-0 flex-1 flex-col gap-6 *:data-[slot=page-header]:mb-0',
		className
	)}
	{...restProps}
>
	{@render children()}
</div>
