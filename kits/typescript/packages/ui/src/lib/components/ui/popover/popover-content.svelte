<script lang="ts">
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		align = 'center',
		sideOffset = 4,
		children,
		...restProps
	}: PopoverPrimitive.ContentProps & { class?: string } = $props();
</script>

<PopoverPrimitive.Portal>
	<!--
		The transform origin comes from bits-ui, so it is a `--bits-*` variable.
		This carried the React registry's equivalent, inherited verbatim in the port
		— a variable nothing in a Svelte tree ever sets — so the origin resolved to
		nothing and the zoom scaled from the box centre rather than from the
		trigger. Silent in the usual way: an undefined custom property makes the
		declaration invalid at computed-value time and the property just falls back.
		`theme-coverage.test.ts` now fails on any such leftover.

		The height cap and the scroll come as a pair, and the pair is deliberate.
		A popover holds whatever a page puts in it, and unlike the menus it carried
		no `overflow-y-auto`, so content taller than the space below the trigger
		simply ran off the bottom of the window — not clipped, not scrollable,
		just unreachable. Capping without the overflow would trade that for
		clipping, which is the same defect wearing a different mask.
	-->
	<PopoverPrimitive.Content
		bind:ref
		data-slot="popover-content"
		{align}
		{sideOffset}
		class={cn(
			'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--bits-popover-content-available-height) w-72 origin-(--bits-popover-content-transform-origin) overflow-y-auto rounded-md border p-4 shadow-md outline-none',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</PopoverPrimitive.Content>
</PopoverPrimitive.Portal>
