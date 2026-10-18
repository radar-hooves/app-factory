<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SheetPrimitive.TitleProps = $props();
</script>

<!-- AppDialog's title treatment, so a sheet and a dialogue name themselves alike. -->
<SheetPrimitive.Title
	bind:ref
	data-slot="sheet-title"
	class={cn(
		'font-display text-lg leading-tight font-semibold tracking-[var(--ds-font-display-tracking,-0.025em)]',
		className
	)}
	{...restProps}
/>
