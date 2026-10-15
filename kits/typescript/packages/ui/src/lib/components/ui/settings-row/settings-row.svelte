<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	// One setting: its name and what it does on the left, its control on the
	// right (a Switch, a Select, a Button). Every settings page in the estate
	// hand-built this, and each spaced it differently.
	//
	// Put rows in a Panel with `pad={false}`: the row carries its own padding so
	// the rule between adjacent rows runs edge to edge, and the first row has no
	// rule above it.
	let {
		label,
		description,
		controlId,
		children,
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		label: string;
		/** What the setting does or costs; wraps beneath the label. */
		description?: string;
		/** The control's `id`: the label then names it (click focuses, screen reader announces). */
		controlId?: string;
		/** The control. */
		children: Snippet;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="settings-row"
	class={cn(
		'border-border flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t px-4 py-3 first:border-t-0',
		className
	)}
	{...restProps}
>
	<div class="min-w-48 flex-1">
		{#if controlId}
			<label for={controlId} class="text-body block leading-tight font-medium">{label}</label>
		{:else}
			<div class="text-body leading-tight font-medium">{label}</div>
		{/if}
		{#if description}
			<p class="text-muted-foreground mt-1 text-sm">{description}</p>
		{/if}
	</div>
	<div class="flex max-w-full min-w-0 flex-none flex-wrap items-center gap-2 *:max-w-full">{@render children()}</div>
</div>
