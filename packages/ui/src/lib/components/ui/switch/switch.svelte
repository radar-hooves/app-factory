<script lang="ts" module>
	/** The two track sizes. `sm` lines up with a `size="sm"` control row. */
	export type SwitchSize = 'default' | 'sm';
</script>

<script lang="ts">
	import { Switch as SwitchPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		size = 'default',
		class: className,
		...restProps
	}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> & { size?: SwitchSize } = $props();

	// Track, thumb and travel are one decision, so they are one table rather
	// than three prop reads at three call sites. The travel is not a picked
	// number: the track carries a 2px transparent border, so the thumb's run is
	// (width - 4) - thumb, which is 16px on the default and 12px on `sm`.
	const TRACK = {
		default: 'h-5 w-9',
		sm: 'h-4 w-7'
	} as const;
	const THUMB = {
		default: 'size-4 data-checked:translate-x-4',
		sm: 'size-3 data-checked:translate-x-3'
	} as const;
</script>

<!--
  Standard shadcn-svelte Switch, rem-based (h-5/w-9/border-2, thumb h-4/w-4/
  translate-x-4) so it scales with the consuming app's root font-size instead
  of a fixed pixel size. The thumb is darkened to dark:bg-foreground so the
  ball stays light on the dark-first theme. The track colour comes from the
  project tokens. An app with a non-standard root font-size (a dense console
  running an 18px root, say) compensates in its own override layer, not here.

  The track is 20px tall (16px at `sm`), under WCAG 2.5.8's 24px minimum, so a
  transparent `::after` skirt takes the pointer target to 32px (28px at `sm`).
  It grows the BLOCK axis only: the track is already 36px wide, so there is
  nothing to win horizontally and an inline skirt would reach into the label
  beside it.
-->
<SwitchPrimitive.Root
	bind:ref
	bind:checked
	class={cn(
		'peer relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors',
		'after:absolute after:inset-x-0 after:-inset-y-1.5',
		'focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
		'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 aria-invalid:ring-3',
		'disabled:cursor-not-allowed disabled:opacity-50',
		'data-checked:bg-primary data-unchecked:bg-input',
		TRACK[size],
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		class={cn(
			'bg-background dark:bg-foreground pointer-events-none block rounded-full shadow-lg ring-0 transition-transform',
			'data-unchecked:translate-x-0',
			THUMB[size]
		)}
	/>
</SwitchPrimitive.Root>
