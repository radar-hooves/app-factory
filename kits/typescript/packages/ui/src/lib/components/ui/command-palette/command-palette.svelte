<script lang="ts">
	/**
	 * The ⌘K palette, wired to the same navigation the shell renders.
	 *
	 * It ships beside AppShell because it had the identical coupling: the
	 * reference implementation imported its app's navigation module directly, so
	 * lifting the shell without it would have left the shell's search affordance
	 * pointing at nothing. One nav config now feeds both.
	 *
	 * The shortcut is bound here rather than in the consuming layout — every app
	 * that had a palette had re-typed the same `(metaKey || ctrlKey) && 'k'`
	 * handler, and one of them then needed a synthetic-keydown hack to reach it
	 * from the shell. Owning the binding removes both.
	 *
	 *     let paletteOpen = $state(false);
	 *     <AppShell {nav} onSearch={() => (paletteOpen = true)}>…</AppShell>
	 *     <CommandPalette bind:open={paletteOpen} {nav} onNavigate={goto} />
	 */
	import type { Snippet } from 'svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import { toItems, type NavSource } from '$lib/components/ui/app-shell/types.js';

	let {
		open = $bindable(false),
		nav,
		onNavigate,
		placeholder = 'Search…',
		navHeading = 'Navigate',
		emptyText = 'No results.',
		shortcut = true,
		children
	}: {
		open?: boolean;
		/** The same value passed to AppShell. Filter for permissions first. */
		nav?: NavSource;
		/**
		 * How to go somewhere. Apps pass SvelteKit's `goto` for a client-side
		 * transition; the default is a full navigation, so the palette works in an
		 * app with no router rather than silently doing nothing.
		 */
		onNavigate?: (href: string) => void;
		placeholder?: string;
		navHeading?: string;
		emptyText?: string;
		/** Bind ⌘K / Ctrl-K to toggle. Turn off to drive `open` yourself. */
		shortcut?: boolean;
		/** Extra command groups: app-specific actions beneath the nav group. */
		children?: Snippet;
	} = $props();

	const items = $derived(toItems(nav));

	function go(href: string) {
		open = false;
		if (onNavigate) onNavigate(href);
		else if (typeof window !== 'undefined') window.location.assign(href);
	}
</script>

<!-- Top-level, with the opt-out inside the handler: a <svelte:document> may not
     sit in a block, and an always-attached listener that returns immediately
     costs nothing next to the dialog it opens. -->
<svelte:document
	onkeydown={(e) => {
		if (!shortcut) return;
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			open = !open;
		}
	}}
/>

<Command.Dialog bind:open title="Command palette" description={placeholder}>
	<Command.Input {placeholder} />
	<Command.List>
		<Command.Empty>{emptyText}</Command.Empty>

		{#if items.length > 0}
			<Command.Group heading={navHeading}>
				{#each items as item (item.href)}
					<Command.Item onSelect={() => go(item.href)} value={item.label}>
						{#if item.icon}<item.icon class="mr-2 size-4" />{/if}
						{item.label}
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}

		{#if children}
			{#if items.length > 0}<Command.Separator />{/if}
			{@render children()}
		{/if}
	</Command.List>
</Command.Dialog>
