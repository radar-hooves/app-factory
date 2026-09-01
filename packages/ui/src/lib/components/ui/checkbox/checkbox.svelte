<script lang="ts">
	import { Checkbox as CheckboxPrimitive } from 'bits-ui';
	import Check from '@lucide/svelte/icons/check';
	import Minus from '@lucide/svelte/icons/minus';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils';

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		indeterminate = $bindable(false),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<CheckboxPrimitive.RootProps> & { class?: string } = $props();
</script>

<!--
  The box is 16px, which is what a checkbox has always looked like and is also
  well under WCAG 2.5.8's 24px minimum target. The `::after` overlay is the
  standard answer: a transparent 6px skirt on every side takes the POINTER
  target to 28px without moving a pixel of the control, so the tick still sits
  where a reader expects it and the row's rhythm is unchanged. It stops 2px
  short of a `gap-2` label, and a click that lands on the label toggles the box
  through the label's own `for` anyway, so the enlarged area can never steal an
  interaction from something else.

  `data-indeterminate` paints the same fill as `data-checked`. It carried none
  until now, so a tri-state checkbox rendered its dash in the FOREGROUND ink on
  a transparent ground — the identical defect the `data-checked` mapping was
  fixed for, one value along, and invisible for the same reason. See styles.css
  §"The bits-ui `data-state` variants".
-->
<CheckboxPrimitive.Root
	bind:ref
	bind:checked
	bind:indeterminate
	data-slot="checkbox"
	class={cn(
		'peer border-border focus-visible:ring-ring data-checked:bg-primary data-checked:text-primary-foreground data-checked:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground data-indeterminate:border-primary aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 relative size-4 shrink-0 rounded-sm border shadow-none transition-shadow after:absolute after:-inset-1.5 focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3',
		className
	)}
	{...restProps}
>
	{#snippet children({ checked: isChecked, indeterminate: isIndeterminate })}
		<span class="flex items-center justify-center text-current">
			{#if isIndeterminate}
				<Minus class="size-3" />
			{:else if isChecked}
				<Check class="size-3" />
			{/if}
		</span>
	{/snippet}
</CheckboxPrimitive.Root>
