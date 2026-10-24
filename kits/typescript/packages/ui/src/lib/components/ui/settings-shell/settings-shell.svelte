<script lang="ts" module>
	import type { IconComponent } from '../app-shell/types.js';

	/** A section of a single-route app: identified by `id`, switched by state. */
	export interface SettingsSection {
		id: string;
		label: string;
		icon?: IconComponent;
		badge?: string | number;
	}
	export interface SettingsSectionGroup {
		heading?: string;
		items: SettingsSection[];
	}
</script>

<script lang="ts">
	/**
	 * The settings destination: its sections are a `panel` page's pane
	 * (`PagePane`), flush against the rail, and the section you are reading is
	 * the page beside it. The route declares `pageType: 'panel'`; this sets no
	 * width, padding or scroller of its own. Below 64rem of window the sections
	 * open as a sheet from the bar.
	 *
	 * The list renders through AppNav rather than a row renderer of its own:
	 * AppNav already owns the group eyebrow, the active row's leading edge and
	 * tint, `aria-current="page"`, the segment-safe prefix match and truncation,
	 * so a row is the same row everywhere in the household.
	 *
	 * Grouping is by WHOSE setting it is — the person's, then the workspace's —
	 * because that is the only split a reader can predict. A group whose `items`
	 * is empty renders nothing (`toGroups` drops it). One label per row, nothing
	 * beneath it: the page introduces its own sections (Panel's `description`).
	 *
	 * The bar names where the reader is, "Settings › Account": the rail has no
	 * row for Settings (it opens from the account menu), so the pane says it.
	 */
	import type { Snippet } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import AppNav from '../app-shell/app-nav.svelte';
	import PagePane from '../app-shell/page-pane.svelte';
	import { getPageSlots } from '../app-shell/page.js';
	import { activeNavTitle, toItems, TITLE_SEPARATOR, type NavSource } from '../app-shell/types.js';
	import Button from '../button/button.svelte';

	type Shared = {
		/** The list's accessible name. */
		listLabel?: string;
		/** What the destination is called, in the bar and over the sheet. */
		title?: string;
		children: Snippet;
	};

	let {
		sections,
		currentPath,
		selected,
		onSelect,
		listLabel = 'Settings sections',
		title = 'Settings',
		children
	}: Shared &
		(
			| {
					/**
					 * ROUTED: the sections, as the package's own navigation vocabulary:
					 * groups of `NavItem` (`{ heading, items }`), bare items, or a mix.
					 * A row at the settings ROOT (`/settings`) needs `exact: true`, or
					 * its prefix match keeps it lit on every section beneath it.
					 */
					sections: NavSource;
					/** The active path. Apps pass `page.url.pathname`, as to AppShell. */
					currentPath?: string;
					selected?: undefined;
					onSelect?: undefined;
			  }
			| {
					/**
					 * STATE-DRIVEN, for a single-route app whose sections swap in place
					 * (canonical-app-shape §Applicability): groups of `SettingsSection`
					 * (`{ id, label, icon? }`). Rows are buttons; `selected` is the
					 * current `id` and `onSelect` fires with the `id` chosen.
					 */
					sections: readonly (SettingsSection | SettingsSectionGroup)[];
					selected: string;
					onSelect: (id: string) => void;
					currentPath?: undefined;
			  }
		) = $props();

	/** The state-driven sections as the rail's vocabulary, the `id` standing as the key. */
	const nav = $derived<NavSource>(
		onSelect
			? (sections as readonly (SettingsSection | SettingsSectionGroup)[]).map((entry) =>
					'items' in entry
						? { heading: entry.heading, items: entry.items.map(({ id, ...rest }) => ({ ...rest, href: id })) }
						: (({ id, ...rest }) => ({ ...rest, href: id }))(entry)
				)
			: (sections as NavSource)
	);

	const here = $derived(
		onSelect
			? toItems(nav).find((item) => item.href === selected)?.label
			: activeNavTitle(nav, currentPath)
	);
	const location = $derived(here ? `${title}${TITLE_SEPARATOR}${here}` : title);

	// Without a shell (a desktop window, an element) nothing hosts the pane, so
	// the same panel frame is drawn here.
	const hosted = getPageSlots() !== undefined;
</script>

{#snippet list(close: () => void)}
	<AppNav
		{nav}
		{currentPath}
		{selected}
		onSelect={onSelect
			? (id: string) => {
					onSelect(id);
					close();
				}
			: undefined}
		label={listLabel}
	/>
{/snippet}

{#if !hosted}
	<div class="ds-page" data-page="panel">
		<div class="ds-page-pane"><div class="ds-page-pane-body">{@render list(() => {})}</div></div>
		<div class="ds-page-main">{@render children()}</div>
	</div>
{:else}
	<PagePane label={listLabel} icon={SettingsIcon} {location}>
		{#snippet body(state)}
			{#if state.mode === 'sheet'}
				<div class="border-border flex items-center justify-between gap-2 border-b py-2 ps-4 pe-2">
					<h2 class="text-sm font-medium">{title}</h2>
					<Button variant="ghost" size="icon" aria-label="Close {title}" onclick={state.close}>
						<X />
					</Button>
				</div>
			{/if}
			{@render list(state.close)}
		{/snippet}
	</PagePane>
	{@render children()}
{/if}
