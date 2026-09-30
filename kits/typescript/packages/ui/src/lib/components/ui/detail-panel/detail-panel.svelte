<script lang="ts">
	import type { Snippet, Component } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import X from '@lucide/svelte/icons/x';
	import StatusBadge from '../status-badge/status-badge.svelte';
	import type { Status } from '../status/index.js';

	let {
		eyebrow,
		title,
		titleFace = 'mono',
		icon: Icon,
		status,
		statusLabel,
		children,
		footer,
		onClose,
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		eyebrow?: string;
		title: string;
		/**
		 * The title's type face. `'mono'` (default, unchanged) reads as an
		 * identifier — a hostname, a key, a machine value. `'display'` reads as
		 * a heading first, for a title that is a name or a label rather than a
		 * machine-produced value (design-system#9).
		 */
		titleFace?: 'mono' | 'display';
		icon?: Component<{ class?: string }>;
		status?: Status;
		statusLabel?: string;
		children: Snippet;
		footer?: Snippet;
		onClose?: () => void;
	} = $props();
</script>

<!-- A card that fills the remaining height of the right-hand ContextColumn; the
     column owns width and placement, this owns the entity's detail. -->
<section
	bind:this={ref}
	class={cn(
		'bg-card border-border ds-edge flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border',
		className
	)}
	{...restProps}
>
	<header class="border-border flex items-start gap-3 border-b px-4 py-3.5">
		{#if Icon}
			<span
				class="border-border bg-background mt-0.5 grid size-9 flex-none place-items-center rounded-md border"
			>
				<Icon class="text-muted-foreground size-4" />
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			{#if eyebrow}
				<div class="text-muted-foreground text-2xs tracking-eyebrow font-medium uppercase">
					{eyebrow}
				</div>
			{/if}
			<h2
				class={cn(
					'text-body truncate font-semibold',
					titleFace === 'display' ? 'font-display' : 'font-mono'
				)}
			>
				{title}
			</h2>
			{#if status && statusLabel}
				<div class="mt-1.5"><StatusBadge {status} label={statusLabel} /></div>
			{/if}
		</div>
		{#if onClose}
			<button
				class="text-muted-foreground hover:text-foreground grid size-7 flex-none place-items-center rounded-md transition-colors"
				onclick={onClose}
				aria-label="Close panel"
			>
				<X class="size-4" />
			</button>
		{/if}
	</header>
	<div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
		{@render children()}
	</div>
	{#if footer}
		<footer class="border-border bg-card/40 flex flex-wrap items-center gap-2 border-t px-4 py-3">
			{@render footer()}
		</footer>
	{/if}
</section>
