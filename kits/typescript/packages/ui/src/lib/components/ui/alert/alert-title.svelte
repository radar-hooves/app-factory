<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils';
	import type { Snippet } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLHeadingElement>> & {
		children?: Snippet;
	} = $props();
</script>

<h5
	bind:this={ref}
	data-slot="alert-title"
	class={cn('col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight', className)}
	{...restProps}
>
	{@render children?.()}
</h5>
