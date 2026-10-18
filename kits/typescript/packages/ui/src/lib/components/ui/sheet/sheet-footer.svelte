<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="sheet-footer"
	class={cn(
		'bg-muted/50 mt-auto flex shrink-0 flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:justify-end',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
