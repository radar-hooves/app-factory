<script lang="ts">
	/**
	 * The bar above a list, on the page ground: the list's title and count,
	 * then its icon actions (each named by its tooltip) and its one labelled
	 * action. The ledger draws its own with this, so every list's bar is the
	 * same bar.
	 *
	 *     <ListToolbar title="Owned properties" meta="3 properties"
	 *       tools={[{ label: 'Download as CSV', icon: Download, onclick: save }]}
	 *       action={{ label: 'Add property', icon: Plus, href: '/property/new' }} />
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Button from '../button/button.svelte';
	import * as Tooltip from '../tooltip/index.js';
	import IconAction from './icon-action.svelte';
	import { cn } from '$lib/utils.js';
	import type { ListAction, ListIconAction } from './types.js';

	let {
		title,
		meta,
		leading,
		children,
		tools = [],
		action,
		label,
		class: className,
		...restProps
	}: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
		title?: string;
		/** Beside the title, quieter: the count, or what the list is of. */
		meta?: string;
		/** Before the title: a switch between views of the same list. */
		leading?: Snippet;
		/** The list's own controls, before its icon actions: a menu, a filter. */
		children?: Snippet;
		/** Icon actions, each named by its tooltip. */
		tools?: ListIconAction[];
		/** The one labelled action, last. */
		action?: ListAction;
		/** The toolbar's accessible name. Defaults to the title. */
		label?: string;
		class?: string;
	} = $props();

	const ActionIcon = $derived(action?.icon);
</script>

<div
	role="toolbar"
	aria-label={label ?? title}
	class={cn('flex min-h-11 flex-none flex-wrap items-center gap-x-2 gap-y-1 px-2 pb-2', className)}
	data-slot="list-toolbar"
	{...restProps}
>
	{@render leading?.()}
	<!--
		Crowded, the text wraps, never ends in an ellipsis: the count drops under
		the title, and the controls drop to a second line before either is cut.
	-->
	<div class="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
		{#if title}<h2 class="text-body font-semibold break-words">{title}</h2>{/if}
		{#if meta}<span class="text-muted-foreground text-sm break-words">{meta}</span>{/if}
	</div>
	<span class="min-w-0 flex-1"></span>
	{@render children?.()}
	{#if tools.length}
		<Tooltip.Provider delayDuration={150}>
			{#each tools as tool (tool.label)}
				<IconAction action={tool} />
			{/each}
		</Tooltip.Provider>
	{/if}
	{#if action}
		<Button
			variant="outline"
			size="sm"
			href={action.href}
			download={action.href ? (action.download === true ? '' : action.download || undefined) : undefined}
			disabled={action.disabled}
			onclick={action.onclick}
			data-slot="list-toolbar-action"
		>
			{#if ActionIcon}<ActionIcon />{/if}{action.label}
		</Button>
	{/if}
</div>
