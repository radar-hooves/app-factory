<script lang="ts">
	import type { Snippet, Component } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		icon?: Component<{ class?: string }>;
		title: string;
		description?: string;
		action?: Snippet;
	};

	let {
		icon: Icon,
		title,
		description,
		action,
		ref = $bindable(null),
		class: className,
		...restProps
	}: Props = $props();
</script>

<div
	bind:this={ref}
	class={cn(
		'bg-card border-border ds-edge flex flex-col items-center justify-center rounded-lg border p-8 text-center',
		className
	)}
	{...restProps}
>
	{#if Icon}
		<div class="bg-muted mb-4 rounded-full p-3">
			<Icon class="text-muted-foreground size-6" />
		</div>
	{/if}
	<h3 class="text-foreground mb-1 text-lg font-semibold">{title}</h3>
	{#if description}
		<p class="text-muted-foreground mb-4 max-w-sm text-sm">{description}</p>
	{/if}
	{#if action}
		{@render action()}
	{/if}
</div>
