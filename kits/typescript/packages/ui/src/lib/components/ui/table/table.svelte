<script lang="ts">
	import type { HTMLTableAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		containerClass,
		children,
		...restProps
	}: WithElementRef<HTMLTableAttributes> & {
		/**
		 * Classes on the scroll container, not on the `<table>`.
		 *
		 * The two are different boxes and only one of them can be told to be
		 * shorter. A sticky header needs a bounded, scrolling ancestor — `class`
		 * lands on the table, which is the wrong element — so an app wanting one
		 * had to reach into this component's internals from the outside with
		 * `[&>[data-slot=table-container]]:max-h-…`, an arbitrary-variant selector
		 * on a structure this package is free to change. That is a private detail
		 * being used as public API; naming the seam makes it public and keeps the
		 * structure ours.
		 */
		containerClass?: string;
	} = $props();
</script>

<div data-slot="table-container" class={cn('relative w-full overflow-x-auto', containerClass)}>
	<table
		bind:this={ref}
		data-slot="table"
		class={cn('w-full caption-bottom text-sm', className)}
		{...restProps}
	>
		{@render children?.()}
	</table>
</div>
