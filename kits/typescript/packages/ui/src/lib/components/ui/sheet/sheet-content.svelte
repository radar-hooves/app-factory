<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	// A sheet stands on the hairline-and-ladder depth every other kit surface
	// uses (README §Depth): an edge border against the dimmed page, no shadow.
	// A side sheet takes a phone's whole width: a sliver of dimmed page beside
	// it is too narrow to read and too narrow to aim at.
	export const sheetVariants = tv({
		base: 'bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out border-border fixed z-50 flex flex-col text-sm outline-none duration-200 ease-out data-closed:duration-150',
		variants: {
			side: {
				right: 'data-closed:slide-out-to-right data-open:slide-in-from-right inset-y-0 right-0 h-full w-full border-l sm:max-w-sm',
				left: 'data-closed:slide-out-to-left data-open:slide-in-from-left inset-y-0 left-0 h-full w-full border-r sm:max-w-sm',
				bottom: 'data-closed:slide-out-to-bottom data-open:slide-in-from-bottom inset-x-0 bottom-0 max-h-[85%] rounded-t-xl border-t',
				top: 'data-closed:slide-out-to-top data-open:slide-in-from-top inset-x-0 top-0 max-h-[85%] rounded-b-xl border-b'
			}
		},
		defaultVariants: { side: 'right' }
	});

	export type SheetSide = VariantProps<typeof sheetVariants>['side'];
</script>

<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';
	import type { ComponentProps, Snippet } from 'svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import SheetOverlay from './sheet-overlay.svelte';
	import SheetPortal from './sheet-portal.svelte';

	let {
		ref = $bindable(null),
		class: className,
		side = 'right',
		portalProps,
		showCloseButton = true,
		children,
		...restProps
	}: WithoutChildrenOrChild<SheetPrimitive.ContentProps> & {
		side?: SheetSide;
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SheetPortal>>;
		showCloseButton?: boolean;
		children: Snippet;
	} = $props();
</script>

<SheetPortal {...portalProps}>
	<SheetOverlay />
	<SheetPrimitive.Content
		bind:ref
		data-slot="sheet-content"
		data-side={side}
		class={cn(sheetVariants({ side }), className)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<SheetPrimitive.Close data-slot="sheet-close">
				{#snippet child({ props })}
					<Button variant="ghost" class="absolute top-3 right-3" size="icon-sm" {...props}>
						<XIcon />
						<span class="sr-only">Close</span>
					</Button>
				{/snippet}
			</SheetPrimitive.Close>
		{/if}
	</SheetPrimitive.Content>
</SheetPortal>
