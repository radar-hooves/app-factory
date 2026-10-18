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

<!-- pr-12 keeps the title clear of the content's close button. -->
<div
	bind:this={ref}
	data-slot="sheet-header"
	class={cn('flex shrink-0 flex-col gap-1.5 border-b p-4 pr-12', className)}
	{...restProps}
>
	{@render children?.()}
</div>
