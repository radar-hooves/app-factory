<script lang="ts">
	/**
	 * The vertical navigation list.
	 *
	 * Rendered by AppShell in the rail/drawer (one element, two states — see
	 * app-shell.svelte), and exported in its own right for a navigation list that
	 * belongs in a PAGE — so it is built from the same affordance rather than
	 * hand-copied. That was the concrete shape of the drift in the estate: one
	 * app's inner nav had reimplemented the active indicator, the group
	 * separators and the collapse behaviour independently of its own top bar.
	 *
	 * It is no longer how an app gets a second navigation COLUMN, because there
	 * is no longer such a thing: AppShell's `sidebar` slot was removed in
	 * 2026.8.11 (operator ruling, 21/08/2026 — no app supports an additional
	 * sidebar). An item carrying `children` discloses them in place, beneath
	 * itself, and that is where a section's own pages go at every width. See
	 * `types.ts` on `children` for why the nested rail won over
	 * modules-on-the-top-bar, and why the depth cap is one.
	 */
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import {
		hasActiveNavChild,
		isNavItemActive,
		navChildren,
		toGroups,
		type NavChildItem,
		type NavItem,
		type NavSource
	} from './types.js';
	import { cn } from '$lib/utils.js';

	let {
		nav,
		currentPath,
		collapsed = false,
		label = 'Primary',
		onNavigate,
		firstLink = $bindable(null),
		class: className
	}: {
		nav?: NavSource;
		/** The active path. Apps pass `page.url.pathname`; see AppShell. */
		currentPath?: string;
		/** Icon-only mode. Labels stay in the accessible tree via sr-only text. */
		collapsed?: boolean;
		/** Accessible name for the landmark; distinguish a secondary column. */
		label?: string;
		/** Fired after any nav link activates — AppShell uses it to shut the drawer. */
		onNavigate?: () => void;
		/**
		 * The first rendered link, bound out. AppShell moves focus here when this
		 * list is the content of an overlay, so a keyboard user lands inside the
		 * thing that just opened rather than behind it.
		 */
		firstLink?: HTMLElement | null;
		class?: string;
	} = $props();

	const groups = $derived(toGroups(nav));

	// Ids are real ids in the consumer's document, and this component renders
	// more than once per page by design (the rail, plus any route-scoped second
	// column). A literal would collide between the two and hand `aria-controls`
	// a coin toss — the same reasoning AppShell applies to its own nav region id.
	const navId = $props.id();

	/**
	 * Disclosure state, and the two-part rule behind it.
	 *
	 * The DEFAULT is derived, never stored: a group is open when the current page
	 * is the parent or one of its children. That is what makes the rail show you
	 * where you are without an app having to seed anything, and it is correct on
	 * the server, on first paint, and after a palette jump or a back button —
	 * none of which are clicks, so none of which stored state would have seen.
	 *
	 * A deliberate toggle OVERRIDES that default for as long as the shell lives,
	 * which in a SvelteKit layout is the whole session: open a group you are not
	 * in and it stays open while you navigate; close the one you are in and it
	 * stays shut. Overriding rather than seeding is what keeps both halves true
	 * at once — an untouched group still follows the path, so walking into a new
	 * section opens it, while a group you made a decision about keeps it.
	 *
	 * Nothing is written to storage. A shared package writing to a fixed
	 * localStorage key collides with the app's own, and collides with itself the
	 * moment a page renders two navs — the same hazard as a literal element id.
	 * An app that wants disclosure to survive a reload owns that decision.
	 *
	 * Keyed by `href`, which is already this component's notion of identity — the
	 * `{#each}` below keys on it too, so two items sharing an href is a Svelte
	 * duplicate-key error before it is anything else. The consequence worth naming:
	 * an app that swaps its whole `nav` (a permission filter, a context switch)
	 * and reuses an href across variants carries the user's open/closed decision
	 * across that swap. That is deliberate, not an oversight — resetting on a
	 * changed `nav` would wipe the override every time a `$derived` nav recomputes,
	 * which in the apps that derive nav from a store is constantly, destroying the
	 * persistence this whole mechanism exists to provide. The href is the contract:
	 * same href, same section, same decision.
	 */
	let overrides = $state<Record<string, boolean>>({});

	function isOpen(item: NavItem): boolean {
		return (
			overrides[item.href] ??
			(isNavItemActive(item, currentPath) || hasActiveNavChild(item, currentPath))
		);
	}

	/** Every item that actually discloses something, by href. */
	const branches = $derived(
		new Map(
			groups
				.flatMap((group) => group.items)
				.filter((item) => navChildren(item).length > 0)
				.map((item) => [item.href, item] as const)
		)
	);

	/**
	 * Escape closes the group focus is inside and returns focus to the control
	 * that opened it, rather than leaving the caret on a row that has just been
	 * hidden.
	 *
	 * Bound to the rows and the chevron rather than to the landmark, because a
	 * branch contains nothing else that can hold focus, and a keyboard listener
	 * on the non-interactive `<nav>` is a genuine a11y-lint finding rather than
	 * noise. Which branch it is comes from the event's own position, so one
	 * function serves every row, nested or flat.
	 *
	 * It is swallowed ONLY when it actually closed something, so Escape anywhere
	 * else still reaches AppShell's window handler and shuts the mobile drawer:
	 * the inner surface wins first, the outer one stays reachable.
	 */
	function onNavKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		const branch = (event.target as HTMLElement | null)?.closest?.('[data-branch]');
		const item = branches.get(branch?.getAttribute('data-branch') ?? '');
		if (!branch || !item || !isOpen(item)) return;
		overrides[item.href] = false;
		event.stopPropagation();
		branch.querySelector<HTMLElement>('[data-ds-nav-disclosure]')?.focus();
	}
</script>

<!--
	The row. One snippet for both levels: a child that rendered through a second
	near-copy is exactly the drift this component was extracted to end, one
	nesting level down.
-->
{#snippet navLink(
	item: NavItem | NavChildItem,
	opts: { child?: boolean; first?: boolean; labelId?: string } = {}
)}
	<!--
		A declared child that IS the page WINS over its parent's prefix match, and
		this ordering is the whole of that rule.

		The obvious way round was wrong, and wrong in the commonest shape there is:
		a parent at `/education` prefix-matches `/education/two`, so a parent whose
		own child was the current page lit up as the current page too — two rows
		carrying `aria-current="page"`, two tints, two edge bars. Fine while nav was
		flat, because the child row did not exist to disagree with; incoherent the
		moment it does, and an ARIA defect besides.

		`within` is therefore computed FIRST and suppresses `active`. What the parent
		keeps is the section-root behaviour that earned prefix matching in the first
		place: on its own page, or on a page under it that no child row claims, it is
		still the active row. A childless item never reaches this at all —
		`hasActiveNavChild` is false for it — so the flat case is untouched.
	-->
	{@const within = hasActiveNavChild(item, currentPath)}
	{@const active = !within && isNavItemActive(item, currentPath)}
	<a
		bind:this={
			() => firstLink,
			(node) => {
				if (opts.first) firstLink = node;
			}
		}
		id={opts.labelId}
		href={item.href}
		class="ds-nav-item"
		data-active={active ? 'true' : undefined}
		data-within={within ? 'true' : undefined}
		data-child={opts.child ? 'true' : undefined}
		aria-current={active ? 'page' : undefined}
		title={collapsed ? item.label : undefined}
		target={item.external ? '_blank' : undefined}
		rel={item.external ? 'noreferrer noopener' : undefined}
		onclick={onNavigate}
		onkeydown={onNavKeydown}
	>
		{#if active}
			<span class="ds-nav-indicator"></span>
		{/if}
		{#if item.icon}
			<item.icon class="size-4.5 flex-none" />
		{:else if collapsed}
			<!-- Icon-less item, collapsed: an initial keeps the row clickable
			     and identifiable rather than rendering an empty target. -->
			<span class="grid size-4.5 flex-none place-items-center text-xs font-semibold"
				>{item.label.slice(0, 1).toUpperCase()}</span
			>
		{/if}
		<span class={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
		{#if item.badge !== undefined && !collapsed}
			<span class="ds-nav-badge">{item.badge}</span>
		{/if}
	</a>
{/snippet}

<nav
	class={cn('ds-nav flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4', className)}
	aria-label={label}
	data-collapsed={collapsed ? 'true' : undefined}
>
	{#each groups as group, i (group.heading ?? group.items[0]?.href ?? i)}
		<div class="flex flex-col gap-1">
			{#if group.heading && !collapsed}
				<div class="ds-nav-heading">{group.heading}</div>
			{:else if group.heading && collapsed && i > 0}
				<!-- Collapsed, a heading cannot be read, so the grouping it conveyed
				     survives as a rule instead of vanishing. -->
				<div class="border-border mx-1 mb-1 border-t" role="presentation"></div>
			{/if}
			{#each group.items as item, j (item.href)}
				{@const first = i === 0 && j === 0}
				<!--
					The collapsed rail is 3.5rem of icons, and an indented tree does not
					fit in it at any depth. Rather than invent a second interaction
					surface for that state — a hover flyout, with its own positioning,
					hover intent, touch story and focus management — a collapsed parent
					renders as exactly the icon-only link it was before this feature
					existed, and its children are not in the document at all.

					Not merely hidden: sr-only rows a sighted user cannot reach and a
					pointer user cannot click are a dead affordance, which this package
					treats as worse than an absent one. The way back is the Collapse
					control immediately below, which is where the user just was. The
					drawer is never collapsed (see AppShell), so a phone always gets the
					full tree.
				-->
				{@const children = collapsed ? [] : navChildren(item)}
				{#if children.length > 0}
					{@const open = isOpen(item)}
					{@const panelId = `${navId}-${i}-${j}`}
					<div class="ds-nav-branch" data-branch={item.href}>
						<div class="ds-nav-row">
							<!--
								Two controls, because there are two actions and one of them is
								navigation. The label goes to the parent's own page; the chevron
								opens the section. Folding both into the link was the obvious
								alternative and it cannot be made honest: `aria-expanded` on
								something that navigates away announces a state the user never
								gets to observe. Making the label expand-only instead was the
								other, and it silently changes what `href` means the day an app
								adds children to an item that already had one — precisely the
								break this release is claiming not to have.
							-->
							{@render navLink(item, { first, labelId: `${panelId}-label` })}
							<button
								type="button"
								class="ds-nav-disclosure"
								data-ds-nav-disclosure
								aria-expanded={open}
								aria-controls={panelId}
								aria-label={`${open ? 'Collapse' : 'Expand'} ${item.label}`}
								onclick={() => (overrides[item.href] = !open)}
								onkeydown={onNavKeydown}
							>
								<ChevronRight class="size-4" />
							</button>
						</div>
						<!--
							Rendered whether open or shut, hidden by the `hidden` attribute
							rather than by an `{#if}`. `aria-controls` must resolve to a real
							element to mean anything, and a reference that only exists while
							the region is already open is a reference nobody needs. `hidden`
							takes the rows out of the accessibility tree and out of the tab
							order at the same time, so the closed state is genuinely closed.
						-->
						<div
							class="ds-nav-children"
							id={panelId}
							hidden={!open}
							role="group"
							aria-labelledby={`${panelId}-label`}
						>
							{#each children as child (child.href)}
								{@render navLink(child, { child: true })}
							{/each}
						</div>
					</div>
				{:else}
					{@render navLink(item, { first })}
				{/if}
			{/each}
		</div>
	{/each}
</nav>
