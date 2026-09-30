<script lang="ts">
	import type { Snippet, Component } from 'svelte';
	import * as Dialog from '../dialog/index.js';
	import X from '@lucide/svelte/icons/x';

	// The one dialogue frame: a titled header with optional icon and subtitle, a
	// scrollable body, and an optional footer action bar. Compose the body from
	// DialogSection so every dialogue separates its information identically.
	let {
		open = $bindable(false),
		onOpenChange,
		title,
		subtitle,
		icon: Icon,
		size = 'md',
		children,
		footer
	}: {
		open?: boolean;
		/**
		 * Fired on every open-state change, including the ones the dialogue makes
		 * for itself — Escape, a click on the scrim, the close button — not only
		 * the ones the caller drives.
		 *
		 * `bind:open` alone cannot express that. A caller that has to reset a form,
		 * abort an in-flight request or clear a selection when its dialogue closes
		 * has nowhere to hang that work: the binding reports the new value but
		 * offers no moment to act on it, so the usual workaround is an `$effect`
		 * watching the bound variable, which also fires on the open leg. In the app
		 * that reported this, 12 of 28 dialogues close through a self-dismiss path,
		 * so it is the majority case rather than an edge.
		 *
		 * The two compose: bind for state, take this for the side effect.
		 */
		onOpenChange?: (open: boolean) => void;
		title: string;
		subtitle?: string;
		icon?: Component<{ class?: string }>;
		/**
		 * The dialogue's measure. Named rather than free-form for the same reason
		 * AppShell's `content` is: a dialogue width is a design-system decision,
		 * and a `class` escape hatch would let every app pick its own again.
		 *
		 * `sm`/`md`/`lg` mean exactly what they always did; `xs` and `xl` extend the
		 * scale at its ends rather than renumbering it, so no existing call site
		 * changes width. Below the `sm:` breakpoint every size is full-bleed
		 * regardless — a phone has one width.
		 */
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
		children: Snippet;
		footer?: Snippet;
	} = $props();

	const widths = {
		/** A confirmation, or a single prompt. */
		xs: 'sm:max-w-sm',
		/** A short form — a handful of fields. */
		sm: 'sm:max-w-md',
		/** The default: a form with sections. */
		md: 'sm:max-w-xl',
		/** A form beside a preview, or a table. */
		lg: 'sm:max-w-3xl',
		/** A full editing surface that stops short of being its own route. */
		xl: 'sm:max-w-5xl'
	};
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content
		class="border-border-strong ds-edge flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 {widths[
			size
		]}"
		showCloseButton={false}
	>
		<header class="border-border flex items-start gap-3 border-b px-6 py-5">
			{#if Icon}
				<span
					class="bg-primary/15 text-primary mt-0.5 grid size-8 flex-none place-items-center rounded-md"
				>
					<Icon class="size-4" />
				</span>
			{/if}
			<div class="min-w-0 flex-1">
				<Dialog.Title class="font-display text-lg leading-tight font-semibold tracking-tight"
					>{title}</Dialog.Title
				>
				{#if subtitle}
					<Dialog.Description class="text-muted-foreground mt-0.5 text-sm"
						>{subtitle}</Dialog.Description
					>
				{/if}
			</div>
			<Dialog.Close
				class="text-muted-foreground hover:text-foreground -mt-1 -mr-1 grid size-8 flex-none place-items-center rounded-md transition-colors"
			>
				<X class="size-4" />
				<span class="sr-only">Close</span>
			</Dialog.Close>
		</header>
		<div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
			{@render children()}
		</div>
		{#if footer}
			<footer
				class="border-border bg-card/50 flex items-center justify-end gap-3 border-t px-6 py-4"
			>
				{@render footer()}
			</footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
