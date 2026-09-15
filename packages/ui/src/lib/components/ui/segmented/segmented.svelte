<script lang="ts" module>
	export interface SegmentedOption<T extends string = string> {
		value: T;
		label: string;
	}
</script>

<script lang="ts" generics="T extends string">
	/**
	 * One value from a small fixed set, every option visible: the scope toggle
	 * in the shell's top bar. Past about five options, use Select. A scope
	 * always has one answer, so the value cannot be cleared.
	 */
	import { ToggleGroup } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		value = $bindable(),
		options,
		label,
		size = 'default',
		class: className
	}: {
		value: T;
		options: readonly SegmentedOption<T>[];
		/** The control's accessible name: what the set is a choice of. */
		label: string;
		/** `sm` is the top-bar height; `default` sits in a page's own control row. */
		size?: 'default' | 'sm';
		class?: string;
	} = $props();

	const ITEM = {
		default: 'h-8 px-3 text-sm',
		sm: 'h-6 px-2 text-xs'
	} as const;
</script>

<ToggleGroup.Root
	type="single"
	bind:value={() => value, (v) => { if (v) value = v as T; }}
	aria-label={label}
	class={cn(
		'border-border bg-surface-1 inline-flex flex-none items-center gap-0.5 rounded-md border p-0.5',
		className
	)}
	data-slot="segmented"
>
	{#each options as option (option.value)}
		<ToggleGroup.Item
			value={option.value}
			class={cn(
				'text-muted-foreground hover:text-foreground rounded-sm font-medium whitespace-nowrap transition-colors',
				'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
				'data-[state=on]:bg-surface-3 data-[state=on]:text-foreground data-[state=on]:font-semibold',
				ITEM[size]
			)}
		>
			{option.label}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
