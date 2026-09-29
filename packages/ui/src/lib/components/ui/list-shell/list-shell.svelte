<script lang="ts">
	/**
	 * ListShell — a module's working list, folded away and brought back by the
	 * app that owns it, beside the content it serves.
	 *
	 * AppShell carries no second-column slot for this on purpose: `sidebar` was
	 * such a slot until 2026.8.11, and what it produced was two apps rendering a
	 * module's own PAGES beside the rail while the other seven rendered them
	 * inside it — the shell shape differing per app, and in one app per module.
	 * Operator ruling, 21/08/2026: no app supports an additional sidebar; a
	 * section's own pages roll out beneath it in the rail (`NavItem.children`).
	 * That ruling is about NAVIGATION. A working list is not navigation — it is
	 * data the module owns (a queue of things waiting on the user), and
	 * `20-sveltekit-frontend.md` already answers where that belongs: "a column
	 * that is not NavItem-shaped … belongs in the page beside the content it
	 * serves." `ContextColumn` is the household's other proof this is a real,
	 * sanctioned shape — a page-level flanking `<aside>`, not a shell slot.
	 *
	 * So this is a companion to AppShell, exactly as `SettingsShell` is: the
	 * shell provides ONE chrome (the rail, the bar, the content frame), and any
	 * module reaches for this to add a foldable list beside its own content,
	 * inside AppShell's content area. Every module gets the same list, not a
	 * hand-rolled column per module — which is the actual thing the 21/08/2026
	 * ruling exists to prevent, still true one level down.
	 *
	 * USE IT WITH `padded={false}` on AppShell, exactly as `SettingsShell`
	 * requires: the list has to reach the content area's edge — flush against
	 * the rail, with no gap — or it reads as a floating card rather than chrome.
	 * It paints itself in the rail's OWN chrome tokens (`bg-shell`,
	 * `text-shell-foreground`) for the same reason: a list that is chrome reads
	 * as chrome, not as a panel someone built inside the page.
	 *
	 * Width is fixed at 25rem (400px), measured off the operator's approved
	 * mockup (radar-hooves/godswood#839, Focus-List.dc.html) rather than picked,
	 * and not exposed as a prop — the same anti-drift discipline `SettingsShell`
	 * applies to its own 240px: one width, chosen once, or ten modules each
	 * guess their own.
	 *
	 * Open/closed is the CALLER's state (`open`, bindable), the same way
	 * AppShell's own `collapsed` is: bind it to persist the choice across
	 * reloads (a module-scoped `$state` in a `.svelte.ts` file, synced to
	 * `localStorage` — `svelte-basics.md` §shared state — or the app's own
	 * settings store). This component holds no storage of its own, on purpose:
	 * a module that already persists user preferences server-side should not
	 * gain a second, disagreeing mechanism here.
	 *
	 * When `open` is false this renders NOTHING — no placeholder, no rail — so
	 * the content beside it gets the freed width back, exactly like the
	 * operator's mockup (Focus-Run.dc.html). Reopening it is deliberately NOT
	 * this component's job: the fold toggle only exists while the list is open
	 * (inside its own header, where the mockup puts it); the reopen affordance
	 * — a "Waiting on you 338" pill, a bare icon, wherever the module wants it —
	 * is the CALLER's own markup, driving the same bound `open`. Fixing that
	 * button's position here would be exactly the one-shape-per-module drift
	 * this file exists to end; the module's own page already earned that
	 * decision by owning the content beside this list. A caller's reopen
	 * control should carry `aria-expanded={open}` itself, so the two controls
	 * (this one, and the caller's) read as one continuous toggle to a screen
	 * reader even though only one is ever in the document at a time:
	 *
	 *     <button onclick={() => (open = true)} aria-expanded={open}>
	 *       Waiting on you <Badge>{waitingCount}</Badge>
	 *     </button>
	 *
	 * Below `md` this never renders, at either state: the rail is already a
	 * drawer there, and a 400px column has nowhere to go beside it. Godswood's
	 * own answer is a dedicated phone route for the same list (Phone.dc.html);
	 * that choice is the app's, not this component's — it only gets out of the
	 * way so the app's own mobile route can render undisturbed.
	 *
	 * The header is chrome (title, the fold toggle, and an optional leading
	 * `actions` snippet for a module-specific control — an "Add" button in the
	 * mockup). Everything below it — tabs, grouped headings, the rows
	 * themselves — is the module's own `children`, exactly as `SettingsShell`
	 * hands its list body to the caller rather than describing a row shape of
	 * its own. A queue is not the only thing this list will ever hold.
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
