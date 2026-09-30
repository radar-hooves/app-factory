<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import AlertDialogPortal from './alert-dialog-portal.svelte';
	import AlertDialogOverlay from './alert-dialog-overlay.svelte';
	import { cn, type WithoutChild, type WithoutChildrenOrChild } from '$lib/utils.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		size = 'default',
		portalProps,
		...restProps
	}: WithoutChild<AlertDialogPrimitive.ContentProps> & {
		size?: 'default' | 'sm';
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialogPortal>>;
	} = $props();

	// Width is computed in JS and applied directly (the same approach AppDialog uses).
	// The stacked `data-[size=…]:sm:max-w-*` Tailwind variant did not take effect here,
	// so the dialog rendered at full `w-full` width; a plain responsive utility is
	// reliable. `data-size` stays on the element for the footer's group-data variant.
	const widths = { default: 'max-w-xs sm:max-w-md', sm: 'max-w-xs' } as const;
</script>

<AlertDialogPortal {...portalProps}>
	<AlertDialogOverlay />
	<AlertDialogPrimitive.Content
		bind:ref
		data-slot="alert-dialog-content"
		data-size={size}
		class={cn(
			'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 bg-popover text-popover-foreground ring-foreground/10 group/alert-dialog-content fixed top-1/2 left-1/2 z-50 flex w-full -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl p-4 ring-1 duration-100 outline-none',
			widths[size],
			className
		)}
		{...restProps}
	/>
</AlertDialogPortal>
