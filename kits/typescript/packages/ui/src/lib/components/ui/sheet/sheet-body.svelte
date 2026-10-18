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

<!-- The part that scrolls, so the header and footer stay put. -->
<div
	bind:this={ref}
	data-slot="sheet-body"
	class={cn('min-h-0 flex-1 overflow-y-auto p-4', className)}
	{...restProps}
>
	{@render children?.()}
</div>
