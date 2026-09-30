<script lang="ts">
	/**
	 * ListShell — a module's working list, folded away and brought back by
	 * the app that owns it, beside the content it serves. Not an AppShell
	 * slot: `sidebar` was removed 2026.8.11 after two apps disagreed on
	 * where a module's own PAGES render (operator ruling 21/08/2026); a
	 * working list is data, not navigation, so it is a page-level companion
	 * like `SettingsShell`/`ContextColumn` — pair with `padded={false}` on
	 * AppShell, as `SettingsShell` requires. `open` is the caller's own
	 * bindable state, never persisted here; closed, this renders nothing,
	 * and reopening is the caller's own control, placed wherever the module
	 * chooses. Hidden below `md` at every state.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';

	let {
		title,
		label = title,
		open = $bindable(true),
		actions,
		children,
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		/** The list's heading, in the shell's display face. */
		title: string;
		/**
		 * The landmark's accessible name. Defaults to `title` — the visible
		 * heading already says what this is, so a module only sets `label`
		 * separately when the heading text would not stand alone as a name
		 * (WCAG 2.4.1), e.g. a heading that leads with a live count.
		 */
		label?: string;
		/**
		 * Whether the list is open. Bindable, and NOT persisted by this
		 * component — bind it to whatever the module already uses to persist a
		 * user preference across a reload.
		 */
		open?: boolean;
		/** Leading header actions beside the title — an "Add" button, a filter. */
		actions?: Snippet;
		/** The list body: tabs, group headings, rows — entirely the module's own. */
		children: Snippet;
	} = $props();

	const listId = $props.id();
</script>

{#if open}
	<aside
		bind:this={ref}
		id={listId}
		aria-label={label}
		class={cn(
			'bg-shell text-shell-foreground border-border hidden w-[25rem] flex-none flex-col border-e md:flex',
			className
		)}
		{...restProps}
	>
		<div class="flex flex-none items-center gap-2 px-5 pt-5 pb-3">
			<h2 class="font-display text-display flex-1 truncate font-semibold tracking-tight">
				{title}
			</h2>
			{#if actions}{@render actions()}{/if}
			<button
				type="button"
				onclick={() => (open = false)}
				aria-expanded="true"
				aria-controls={listId}
				aria-label={`Fold ${label} away`}
				title={`Fold ${label} away`}
				class="text-shell-muted-foreground hover:text-shell-foreground border-border grid size-9 flex-none place-items-center rounded-md border transition-colors"
			>
				<PanelLeftClose class="size-4" />
			</button>
		</div>
		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
			{@render children()}
		</div>
	</aside>
{/if}
