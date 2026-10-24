<script lang="ts">
	/**
	 * The application shell: navigation, top bar and page frame, once.
	 *
	 * Primitives and page chrome are not what makes an app feel like an app — the
	 * shell is. Five household frontends were surveyed before this API was
	 * settled, and between them they had built five shells: a rail-plus-drawer,
	 * an eleven-file collapsible sidebar tree under its own top bar, and three
	 * header-only bars that each solved the mobile question differently. They
	 * agreed on almost nothing structurally while looking like they were trying
	 * to be the same thing.
	 *
	 * There is now exactly one composition, no variant prop to choose it: a
	 * permanent side rail on md+ (an overlay drawer below it) carrying primary
	 * navigation and the brand, PLUS a
	 * real top navbar (search, leading/trailing slots, theme toggle, identity) —
	 * always both together. Operator ruling, 31/07/2026: every household app
	 * renders one shell shape; apps do not choose variants.
	 *
	 * The collapse toggle is the leading edge of the top bar, before the page's
	 * title, with a thin separator after it — where the shadcn sidebar blocks put
	 * `Sidebar.Trigger`. The rail's header holds the brand alone, and the foot is
	 * left to the app.
	 *
	 * Search can sit in either of two places, because it reads as a different
	 * thing depending on what is beside it. `searchPlacement` defaults to
	 * `leading` — its historical spot just after the `context` slot, so a shell
	 * that never names the prop is unchanged — and `trailing` moves it into the
	 * right-hand group with the theme toggle and identity, so that when `context`
	 * carries route content the global affordance reads as global rather than as
	 * part of the switcher next to it.
	 *
	 * Content WIDTH is not a prop. A route declares what it is (`pageType`:
	 * `reading`, `panel` or `tool`, see page.ts) and the shell owns everything
	 * that follows from it: the column's width and centring, the gutters, the
	 * pane flush against the rail, the aside beside the content, and which of
	 * them scrolls. The less an app decides, the better (operator, 24/10/2026).
	 *
	 * Content TEXTURE came back the same way, on the same kind of evidence. Two
	 * apps had separately built one picture — a faint dot-grid floor with a soft
	 * accent vignette — under two names in two app.css files, and one of them
	 * applied it as a helper class per route, so it reached four routes out of
	 * about fifteen. Which pages wore the house atmosphere was decided by which
	 * pages someone had happened to touch. `texture` is one named picture the
	 * SHELL paints once, its inks tuned by custom properties. It shipped off by
	 * default so its arrival moved nobody; it is ON by default now, because an
	 * opt-in house style is not a house style — it is a survey of who
	 * remembered. `collapsible` is on for the same reason.
	 *
	 * Everything else the surveyed apps differed on turned out to be a slot, not
	 * a variant: the brand, the identity surface, a context switcher, a banner.
	 * Those are snippets, so this package imports no app store, no app route and
	 * no app brand — the coupling that made the best shell in the estate
	 * unliftable in the first place.
	 *
	 * There is NO second navigation column, and there is no slot to make one.
	 * `sidebar` was such a slot until 2026.8.11, and what it produced was two
	 * apps rendering a module's own pages beside the rail while the other seven
	 * rendered them inside it — the shell shape differing per app, and in one app
	 * per MODULE, which is the thing this component exists to stop. Operator
	 * ruling, 21/08/2026, on seeing one app's two modules disagree: no app
	 * supports an additional sidebar; a section's own pages roll out beneath it
	 * in the rail. That is `NavItem.children` (see types.ts), which the rail
	 * already discloses at every width and folds into the one drawer on a phone.
	 *
	 * The minimum useful call is two props:
	 *
	 *     <AppShell nav={navGroups} brandTitle="Console" currentPath={page.url.pathname}>
	 *       {@render children()}
	 *     </AppShell>
	 */
	import type { Snippet } from 'svelte';
	import {
		providePageSlots,
		type PageAsideRegistration,
		type PageColumnState,
		type PagePaneRegistration,
		type PageSlots,
		type PageType
	} from './page.js';
	import ColumnScope from './column-scope.svelte';
	import type { ShellTexture } from './texture.js';
	import { toggleMode } from 'mode-watcher';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import Search from '@lucide/svelte/icons/search';
	import MessageSquarePlus from '@lucide/svelte/icons/message-square-plus';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	import PanelLeft from '@lucide/svelte/icons/panel-left';
	import PanelRight from '@lucide/svelte/icons/panel-right';
	import * as Sheet from '../sheet/index.js';
	import AppNav from './app-nav.svelte';
	import { activeNavTitle, shortLocation, toItems, type NavSource } from './types.js';
	import BarActions from './bar-actions.svelte';
	import { shellReport } from './report.svelte.js';
	import {
		provideShellActions,
		provideShellControls,
		type BarActionsSlot,
		type ShellActionsHolder,
		type ShellControlsSlot
	} from './controls.js';
	import { cn } from '$lib/utils.js';
	import ResizeHandle from '../resize-handle/resize-handle.svelte';

	let {
		nav,
		navLabel = 'Primary',
		currentPath,
		collapsible = true,
		collapsed = $bindable(false),
		brand,
		brandTitle,
		brandMark,
		homeHref = '/',
		banner,
		context,
		actions,
		identity,
		onSearch,
		searchLabel = 'Search…',
		searchShortcut = '⌘K',
		searchPlacement = 'leading',
		themeToggle = true,
		onToggleTheme,
		pageType = 'reading',
		title,
		texture = 'grid',
		children
	}: {
		/** Navigation: bare items, groups, or a mix. Filter for permissions first. */
		nav?: NavSource;
		/** The primary nav landmark's accessible name — forwarded to the rail/drawer
		    AppNav. Distinguish it from a second shell on the same page, or from a
		    route-scoped secondary AppNav. */
		navLabel?: string;
		/**
		 * The current path, for active state and for closing the mobile nav on
		 * navigation. Apps pass `page.url.pathname`.
		 *
		 * It is a prop rather than a `$app/state` import on purpose: this package
		 * is built with svelte-package and has no SvelteKit runtime of its own, so
		 * importing `$app/state` would make SvelteKit a hard peer AND make the
		 * shell untestable outside a running app. One line at the call site buys
		 * a component that is framework-agnostic and genuinely drivable.
		 */
		currentPath?: string;
		/**
		 * Offer an icon-only collapse toggle at the leading edge of the top bar.
		 *
		 * Defaults ON. It was opt-in while the control was being introduced, and
		 * two of nine household apps opted in — so seven rails could not be
		 * collapsed, for no reason anyone had chosen. The shell shape is not an
		 * app's to pick (operator ruling, 31/07/2026); set `false` only where a
		 * rail genuinely must not collapse.
		 */
		collapsible?: boolean;
		/** Rail collapse state. Bind it to persist the choice across sessions. */
		collapsed?: boolean;
		/** Full control of the brand lockup. Overrides brandTitle/brandMark. */
		brand?: Snippet;
		/** Wordmark text, rendered in the display face. */
		brandTitle?: string;
		/** The mark beside the wordmark — an app's own logo component. */
		brandMark?: Snippet;
		/** Where the brand links. */
		homeHref?: string;
		/** Full-width region directly under the top bar: reconnect notices, trials. */
		banner?: Snippet;
		/** Leading top-bar slot, before the search affordance: a context switcher. */
		context?: Snippet;
		/** Trailing top-bar slot, before the theme toggle: app-level action buttons. */
		actions?: Snippet;
		/** The signed-in user surface. Rendered once, at the end of the top bar.
		 *  It stays there at EVERY width rather than moving into the rail foot on
		 *  desktop: the rail is an overlay drawer below `md`, so a rail-placed
		 *  account is two taps away and who-am-I is hidden behind the menu; and
		 *  the alternative, rendering it in both, is the duplication this file
		 *  exists to avoid. */
		identity?: Snippet;
		/** Provide to render the search affordance. Usually opens a CommandPalette. */
		onSearch?: () => void;
		searchLabel?: string;
		/** The shortcut hint rendered in the search affordance; '' hides the kbd. */
		searchShortcut?: string;
		/**
		 * Where the search affordance sits in the top bar. `leading` (default)
		 * keeps its historical position just after the `context` slot; `trailing`
		 * moves it into the right-hand group with the theme toggle and identity —
		 * for when `context` carries route content and search should read as a
		 * global control rather than as part of it.
		 */
		searchPlacement?: 'leading' | 'trailing';
		themeToggle?: boolean;
		/** Override the theme action. Defaults to mode-watcher's toggleMode. */
		onToggleTheme?: () => void;
		/**
		 * What the route is: `reading` (the default), `panel` or `tool`
		 * (page.ts). The route declares it; the shell owns every width, gutter
		 * and column that follows. Apps pass `page.data.pageType`.
		 */
		pageType?: PageType;
		/**
		 * The page's own name, for the bar when neither the rail nor the page's
		 * pane names where the reader is. Apps pass `page.data.title`.
		 */
		title?: string;
		/**
		 * The house atmosphere on the content region: `grid` (a dot-grid floor
		 * plus a corner vignette) or `none`.
		 *
		 * Defaults to `grid` — the house atmosphere every app wears. It shipped
		 * as `none` so its introduction moved nobody, and the result was the drift
		 * it was built to end: five of nine apps had it, three of those through a
		 * hand-rolled `*-dotgrid` class in their own app.css under three names,
		 * two ink variables and two pitches, only one carrying the
		 * `background-attachment: local` that stops the floor sliding under the
		 * scroller. One default retires all three. The inks and the pitch are
		 * `--ds-shell-texture-*` custom properties an app retunes in one
		 * declaration; `none` turns it off.
		 */
		texture?: ShellTexture;
		children: Snippet;
	} = $props();

	const hasNav = $derived(toItems(nav).length > 0);

	// The page's own columns, registered by `<PagePane>` and `<PageAside>`.
	// Raw, not deep: a registration is stored as given, so the page that made it
	// can find it again to withdraw it (a deep proxy would never equal it).
	class Slots implements PageSlots {
		pane = $state.raw<PagePaneRegistration | null>(null);
		aside = $state.raw<PageAsideRegistration | null>(null);
	}
	const slots = new Slots();
	providePageSlots(slots);

	// A page that registers a pane is a panel page, whatever its route forgot to
	// say: the pane is never dropped for a missing declaration.
	const type = $derived<PageType>(slots.pane ? 'panel' : pageType);

	// Where the user is, in words: the rail is icons when collapsed and a closed
	// drawer on a phone, so the bar names the page, "Section › Page" inside a
	// section and the item's one name otherwise. A page the rail has no row for
	// is named by its pane ("Settings › Account") or, failing that, its title.
	const location = $derived(
		activeNavTitle(nav, currentPath) ??
			(type === 'panel' ? slots.pane?.location : undefined) ??
			title
	);

	// On a phone the bar holds one name, the page's own: a trail does not fit
	// beside the menu, the brand and the bar's icons, and cut letters help no one.
	const shortName = $derived(shortLocation(nav, currentPath, location));

	// The page's status and actions, registered by `<ShellActions>` from the route.
	// Raw, not deep, so the page that registered it can find it again to withdraw it.
	class PageBar implements ShellActionsHolder {
		current = $state.raw<BarActionsSlot | null>(null);
	}
	const pageBar = new PageBar();
	provideShellActions(pageBar);

	// The page's scope controls, registered by `<ShellControls>` from the route.
	const controls: ShellControlsSlot = $state({ content: null });
	provideShellControls(controls);

	// A pane is a column from 64rem of window and a sheet below it; a tool or
	// panel page's aside is a column from 80rem. A reading page's aside never
	// becomes a sheet: below 66rem of content region it follows the column (CSS).
	const PANE_WIDE = '(min-width: 64rem)';
	const ASIDE_WIDE = '(min-width: 80rem)';
	let paneWide = $state(true);
	let asideWide = $state(true);
	$effect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		const pane = window.matchMedia(PANE_WIDE);
		const aside = window.matchMedia(ASIDE_WIDE);
		const sync = () => {
			paneWide = pane.matches;
			asideWide = aside.matches;
		};
		sync();
		pane.addEventListener('change', sync);
		aside.addEventListener('change', sync);
		return () => {
			pane.removeEventListener('change', sync);
			aside.removeEventListener('change', sync);
		};
	});

	const pane = $derived(type === 'panel' ? slots.pane : null);
	const aside = $derived(slots.aside);
	const paneColumn = $derived(pane !== null && paneWide);
	const asideMode = $derived<PageColumnState['mode'] | null>(
		aside === null
			? null
			: type === 'reading'
				? 'stacked'
				: asideWide
					? 'column'
					: 'sheet'
	);

	// The page may arrange itself around where its pane is drawn.
	$effect(() => {
		pane?.onmode?.(paneColumn ? 'column' : 'sheet');
	});

	// The fold is the reader's, remembered under the pane's own key.
	let paneFolded = $state(false);
	const foldKey = $derived(pane?.folded ? pane.remember : undefined);
	$effect(() => {
		const key = foldKey;
		if (!key) {
			paneFolded = false;
			return;
		}
		try {
			paneFolded = localStorage.getItem(key) === '1';
		} catch {
			paneFolded = false;
		}
	});
	function setFolded(next: boolean) {
		paneFolded = next;
		const key = pane?.remember;
		if (!key) return;
		try {
			localStorage.setItem(key, next ? '1' : '0');
		} catch {
			// Remembered for this visit only.
		}
	}

	let paneSheetOpen = $state(false);
	let asideSheetOpen = $state(false);
	// A navigation puts a sheet away, and so does the window widening into a column.
	$effect(() => {
		void currentPath;
		paneSheetOpen = false;
		asideSheetOpen = false;
	});
	$effect(() => {
		if (paneColumn || !pane) paneSheetOpen = false;
		if (asideMode !== 'sheet') asideSheetOpen = false;
	});

	const paneState = $derived<PageColumnState>({
		mode: paneColumn ? 'column' : 'sheet',
		folded: paneColumn && Boolean(pane?.folded) && paneFolded,
		fold: () => setFolded(true),
		unfold: () => setFolded(false),
		close: () => (paneSheetOpen = false)
	});
	const asideState = $derived<PageColumnState>({
		mode: asideMode ?? 'stacked',
		folded: false,
		fold: () => {},
		unfold: () => {},
		close: () => (asideSheetOpen = false)
	});

	// Rail width is a personal preference: localStorage, one key across apps.
	// A drag below RAIL_SNAP collapses; the width survives and returns on expand.
	let railWidth = $state<number | null>(null);
	let resizing = $state(false);

	// The texture is resolved ONCE, one answer feeding both the class and the
	// attribute, so `texture={null}` from a loosely-typed prop bag cannot
	// produce a class with no matching rule.
	const textured = $derived(texture != null && texture !== 'none' ? texture : null);

	// The disclosure toggle and the region it opens have to be programmatically
	// related, not merely adjacent: `aria-expanded` says the control is open,
	// `aria-controls` says WHAT it opened, and assistive technology uses the
	// pair to jump straight to the region instead of trusting DOM order (#12).
	//
	// Generated rather than a literal, because the id is a real one in the
	// consumer's document. A fixed `ds-shell-nav` would collide with an app's
	// own element of that name, and would collide with ITSELF the moment a page
	// mounts two shells — and `document.getElementById` would answer with a coin
	// toss, which is the same failure the rail deliberately avoids by being one
	// element rather than two.
	const shellId = $props.id();
	const navRegionId = `${shellId}-nav`;

	// The mobile nav is an overlay below `md`; on `md`+ the rail is a permanent
	// column and this stays false. It closes on any navigation so a tap-through
	// never leaves it covering the page it just opened.
	let mobileNavOpen = $state(false);
	$effect(() => {
		// Reading `currentPath` registers this effect to re-run on every
		// navigation — link tap, palette jump, or back button — which is exactly
		// when the mobile nav should close.
		void currentPath;
		mobileNavOpen = false;
	});

	// The DRAWER is never collapsed, and that `&& !mobileNavOpen` is a fix rather
	// than a flourish. The rail and the drawer are one element carrying one
	// `collapsed` state, so a user who collapsed the rail on a desktop and later
	// opened the menu on a phone was handed a 3.5rem icon-only drawer with no way
	// out — the Collapse control is `md:grid` and does not render at that width.
	// Nesting did not cause that, it raised the stakes: a collapsed rail renders
	// no children, so the phone would have lost the sub-navigation entirely.
	// `mobileNavOpen` implies narrow (the matchMedia effect below is what earns
	// that), so this can never suppress a legitimate desktop collapse.
	const railCollapsed = $derived(collapsible && collapsed && !mobileNavOpen);

	// A collapsed rail PEEKS: while a mouse rests on it, or keyboard focus is
	// inside it, it widens over the page to show labels, and slims again when
	// either leaves. The page does not reflow (the rail keeps its slim slot and
	// the extra width overlays; see `data-peek` in styles.css). `collapsed` is
	// untouched, so what an app persists is still the user's pin, the toggle.
	//
	// Pointer peeks need a mouse or pen: a touch tap fires pointerenter too, and
	// a rail that opened on a tap would sit over the link being aimed at. Below
	// md the rail is a drawer, never `railCollapsed`, so this cannot arise there.
	// Focus peeks only for keyboard focus (`:focus-visible`), so pressing the
	// toggle with a mouse does not hold the rail open. `peekSuppressed` is the
	// other half of that: collapsing from under the pointer would otherwise peek
	// at once and read as a toggle that did nothing, so it waits for the pointer
	// to leave first.
	const PEEK_DELAY_MS = 120;
	let pointerOn = $state(false);
	let focusIn = $state(false);
	let peekSuppressed = $state(false);
	let peekTimer: ReturnType<typeof setTimeout> | undefined;
	const peeking = $derived(railCollapsed && !peekSuppressed && (pointerOn || focusIn));
	// What the rail DRAWS: labels while peeking, icons otherwise.
	const railNarrow = $derived(railCollapsed && !peeking);

	function peekPointerEnter(event: PointerEvent) {
		if (event.pointerType === 'touch') return;
		// The toggle is in the bar, so a collapse made there leaves the suppression
		// set with the pointer off the rail; coming onto the rail ends it.
		peekSuppressed = false;
		clearTimeout(peekTimer);
		peekTimer = setTimeout(() => (pointerOn = true), PEEK_DELAY_MS);
	}
	function peekPointerLeave() {
		clearTimeout(peekTimer);
		pointerOn = false;
		peekSuppressed = false;
	}
	function peekFocusIn(event: FocusEvent) {
		const target = event.target as HTMLElement | null;
		if (target?.matches?.(':focus-visible')) focusIn = true;
	}
	function peekFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!next || !(event.currentTarget as HTMLElement).contains(next)) focusIn = false;
	}
	function toggleCollapsed() {
		collapsed = !collapsed;
		peekSuppressed = true;
	}
	$effect(() => () => clearTimeout(peekTimer));

	// The collapse toggle's accessible name states what pressing it will DO, so it
	// flips with the state: collapsed → "Expand", expanded → "Collapse".
	const collapseLabel = $derived(collapsed ? 'Expand sidebar' : 'Collapse sidebar');

	// Focus follows the overlay, in both directions. Opening a drawer and leaving
	// the caret behind it strands a keyboard user in a page they can no longer
	// see; closing it without returning focus drops them at the top of the
	// document. Neither is visible in a screenshot and neither is something the
	// consuming app can fix from the outside, so the shell owns it.
	let menuButton = $state<HTMLButtonElement | null>(null);
	let overlayFirstFocus = $state<HTMLElement | null>(null);
	$effect(() => {
		if (mobileNavOpen) overlayFirstFocus?.focus();
	});

	function closeMobileNav() {
		if (!mobileNavOpen) return;
		mobileNavOpen = false;
		menuButton?.focus();
	}

	// Crossing up into md closes the overlay. Without this, opening the drawer on
	// a phone and then widening (rotate, split-view, a resized window) leaves
	// `mobileNavOpen` true while the rail is back in flow — a stale state that
	// also makes the modal semantics below wrong. Closing it here is what earns
	// the invariant the dialog role depends on: open implies narrow.
	$effect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		const wide = window.matchMedia('(min-width: 48rem)');
		const sync = () => {
			if (wide.matches) mobileNavOpen = false;
		};
		sync();
		wide.addEventListener('change', sync);
		return () => wide.removeEventListener('change', sync);
	});

	// Tab must not walk out of an overlay into the page it is covering. A full
	// `inert` on the rest of the shell would be the heavier answer; wrapping at
	// the ends is enough here because the overlay's content is a short, flat list.
	function trapTab(event: KeyboardEvent) {
		if (event.key !== 'Tab' || !mobileNavOpen) return;
		const overlay = event.currentTarget as HTMLElement;
		const candidates = [
			...overlay.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
		].filter((el) => el.tabIndex !== -1);
		// Drop what CSS has hidden — anything display:none must not be a tab stop. `getClientRects()` is the check that works
		// against a real layout; where there is no layout engine at all it reports
		// EVERYTHING as hidden, so an empty result means "cannot tell", not "none",
		// and the trap falls back to the unfiltered set rather than silently
		// switching itself off.
		const visible = candidates.filter((el) => el.getClientRects().length > 0);
		const focusable = visible.length > 0 ? visible : candidates;
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function toggleTheme() {
		if (onToggleTheme) onToggleTheme();
		else toggleMode();
	}

	// `[` toggles the rail — but only when it is not a character the user is
	// trying to TYPE. A bare printable key bound globally would otherwise eat every
	// `[` typed into a search field, a JSON editor or any input the consumer
	// renders, so the shortcut yields whenever focus is on an editable element.
	// This rides the window keydown the shell already owns for Escape rather than
	// adding a second document-level listener.
	function isTypingTarget(target: EventTarget | null): boolean {
		const el = target as HTMLElement | null;
		if (!el || typeof el.tagName !== 'string') return false;
		return (
			el.tagName === 'INPUT' ||
			el.tagName === 'TEXTAREA' ||
			el.tagName === 'SELECT' ||
			el.isContentEditable
		);
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') {
			closeMobileNav();
		} else if (
			collapsible &&
			e.key === '[' &&
			!e.metaKey &&
			!e.ctrlKey &&
			!e.altKey &&
			!isTypingTarget(e.target)
		) {
			toggleCollapsed();
		}
	}}
/>

{#snippet brandLockup(compact = false)}
	<a
		href={homeHref}
		class={cn(
			'flex flex-none items-center gap-2.5',
			compact ? '' : 'h-14 px-4',
			railNarrow && !compact && 'justify-center px-0',
			railCollapsed && !railNarrow && !compact && 'px-3'
		)}
		aria-label={brandTitle ?? 'Home'}
	>
		{#if brand}
			{@render brand()}
		{:else}
			{#if brandMark}
				<!--
					The mark sits directly on the chrome, with no plate behind it. The
					chrome is the app's to brand, so anything painted here from a page
					token punches a page-coloured hole through the brand colour; and a
					mark is chosen to suit the ground it sits on — every brand guideline
					says so, usually as "the white mark on a dark ground" — so it needs
					no separating. An app that wants a plate owns the whole lockup
					through the `brand` snippet, which is what that is for.
				-->
				<span class="grid size-8 flex-none place-items-center">
					{@render brandMark()}
				</span>
			{/if}
			{#if brandTitle && !railNarrow}
				<!--
					The wordmark stands down below sm, leaving the mark alone. On a phone
					the rail is gone, so this same lockup is what the top bar carries — and
					that bar also holds the menu button, the search affordance, the theme
					toggle and the identity surface. With the wordmark beside them, search
					truncated to a word (and in one app to a single letter) at 390px.

					This is a package default because three apps each discovered it
					independently and each wrote its own `brand` override to get it, with
					three near-identical comments. An app that overrides the whole brand
					slot to re-earn a behaviour the shell could give everyone is the shell
					failing to ship something good.
				-->
				<span class="font-display text-body hidden font-semibold tracking-[var(--ds-font-display-tracking,-0.025em)] sm:inline"
					>{brandTitle}</span
				>
			{/if}
		{/if}
	</a>
{/snippet}

<!--
	One search button, rendered in one of two places by `searchPlacement`. It is a
	snippet rather than two literals so the two positions cannot drift apart — same
	markup, same `data-testid`, same behaviour; only the sizing classes differ.
	`sizing` is where the difference lives: leading fills the row (`flex-1`),
	trailing sizes to its clamp without stretching the right-hand group.
-->
{#snippet searchButton(sizing: string)}
	<!--
		Below `sm` this is an icon-only square, matching the menu/theme-toggle
		buttons either side of it: a fixed-width pill sharing the row with a
		`context` switcher or a couple of trailing `actions` badges has as little
		as the width of one glyph to shrink into, and a button painting a single
		truncated letter reads as broken rather than as a control. `sizing`
		supplies the width/flex/padding pair at each tier (base then `sm:`), so
		this snippet's own classes carry shape only and never fight it over the
		same property.
	-->
	<button
		onclick={onSearch}
		class={cn(
			'border-border text-shell-muted-foreground hover:text-shell-foreground flex items-center rounded-md border transition-colors sm:text-sm',
			sizing
		)}
		data-testid="ds-shell-search"
	>
		<Search class="size-4 flex-none" />
		<span class="hidden truncate sm:inline">{searchLabel}</span>
		{#if searchShortcut}
			<kbd
				class="border-border bg-background text-shell-muted-foreground text-2xs ml-auto hidden rounded border px-1.5 py-0.5 font-mono sm:block"
				>{searchShortcut}</kbd
			>
		{/if}
	</button>
{/snippet}

<div class="ds-shell bg-background text-foreground flex h-dvh overflow-hidden">
	<!-- WCAG 2.4.1: every app gets the bypass link, rather than one app having it. -->
	<a href="#ds-main" class="ds-skip-link">Skip to content</a>

	{#if hasNav}
		{#if mobileNavOpen}
			<button
				class="bg-background/70 fixed inset-0 z-40 backdrop-blur-sm md:hidden"
				aria-label="Dismiss menu"
				tabindex="-1"
				onclick={closeMobileNav}
			></button>
		{/if}

		<!--
			ONE element, not two. The desktop rail and the mobile drawer are the
			same aside wearing a different `data-drawer` state, because rendering
			the rail's contents twice duplicates whatever the CONSUMER put in the
			`identity` snippet — a second copy of their menu, their test hooks, and
			any `id` they wrote, live in the DOM at the same time. Which of the two
			`document.getElementById` then answers with is a coin toss the consumer
			never agreed to. The reference shell rendered it twice; that is the one
			piece of its behaviour deliberately not carried over.

			The rail/drawer swap is therefore CSS on this single element (see
			`.ds-shell-rail[data-drawer]` in styles.css) rather than two branches.
		-->
		<aside
			id={navRegionId}
			class="ds-shell-rail bg-shell text-shell-foreground border-border flex-none flex-col border-r"
			style={railWidth ? `--ds-shell-rail-width: ${railWidth}px` : undefined}
			data-collapsed={railCollapsed ? 'true' : undefined}
			data-peek={peeking ? 'true' : undefined}
			data-resizing={resizing ? 'true' : undefined}
			data-drawer={mobileNavOpen ? 'true' : undefined}
			data-testid={mobileNavOpen ? 'ds-shell-drawer' : undefined}
			role={mobileNavOpen ? 'dialog' : undefined}
			aria-modal={mobileNavOpen ? 'true' : undefined}
			aria-label={mobileNavOpen ? 'Navigation' : undefined}
			onkeydown={trapTab}
			onpointerenter={peekPointerEnter}
			onpointerleave={peekPointerLeave}
			onfocusin={peekFocusIn}
			onfocusout={peekFocusOut}
		>
			{#if mobileNavOpen}
				<button
					bind:this={overlayFirstFocus}
					onclick={closeMobileNav}
					class="border-border text-shell-muted-foreground hover:text-shell-foreground absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-3 z-10 grid size-8 place-items-center rounded-md border md:hidden"
					aria-label="Close menu"
				>
					<X class="size-4" />
				</button>
			{/if}

			{@render brandLockup()}
			<AppNav
				{nav}
				{currentPath}
				collapsed={railCollapsed}
				peek={peeking}
				label={navLabel}
				onNavigate={() => (mobileNavOpen = false)}
			/>

			<!--
				The drawer's foot: the one place feedback sits on a phone, where nothing
				floats over the page. From md it is the bar's icon. Settings is the
				account menu's, never a row here.
			-->
			{#if mobileNavOpen && shellReport.open}
				<div class="ds-shell-rail-foot mt-auto">
					<button
						type="button"
						class="ds-nav-item w-full"
						data-testid="ds-shell-drawer-report"
						onclick={() => {
							const open = shellReport.open;
							closeMobileNav();
							open?.();
						}}
					>
						<MessageSquarePlus class="ds-nav-icon size-[1.125rem] flex-none" aria-hidden="true" />
						<span class="truncate">Report a problem</span>
					</button>
				</div>
			{/if}
			{#if collapsible && !railCollapsed && !mobileNavOpen}
				<ResizeHandle
					bind:width={railWidth}
					bind:dragging={resizing}
					storageKey="ds-shell-rail-width"
					snap={170}
					onsnap={() => {
						collapsed = true;
						peekSuppressed = true;
					}}
					data-testid="ds-rail-resize"
				/>
			{/if}
		</aside>
	{/if}

	<div class="flex min-h-0 min-w-0 flex-1 flex-col">
		<!-- The bar wraps when crowded, at every width, and pads top and bottom
		     alike so a second row clears both edges. Kept to one row, it shrank
		     `context` below its own content and the next item painted over it, so
		     the app's own control under the overlap could not be clicked
		     (mission-command's workspace menu, 04/10/2026). -->
		<header
			class="ds-shell-bar bg-shell/80 text-shell-foreground border-border sticky top-0 z-20 flex min-h-14 flex-none flex-wrap items-center gap-2 border-b px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 backdrop-blur sm:gap-3 sm:px-5"
		>
			{#if hasNav}
				<!-- `aria-controls` names the region this toggle opens. It is present
				     whenever that region is in the document, which is always — the
				     rail and the drawer are ONE element, so the reference is live from
				     first render and never dangles. -->
				<button
					bind:this={menuButton}
					onclick={() => (mobileNavOpen ? closeMobileNav() : (mobileNavOpen = true))}
					class="border-border text-shell-muted-foreground hover:text-shell-foreground grid size-9 flex-none place-items-center rounded-md border md:hidden"
					aria-label="Menu"
					aria-expanded={mobileNavOpen}
					aria-controls={navRegionId}
					data-testid="ds-shell-menu"
				>
					{#if mobileNavOpen}
						<X class="size-4" />
					{:else}
						<Menu class="size-4" />
					{/if}
				</button>
			{/if}

			<!--
				The collapse toggle is the leading edge of the bar, before the page's
				title and a thin separator after it: where the shadcn sidebar blocks put
				`Sidebar.Trigger`, so the rail's header holds the brand alone. `md:grid`
				keeps it off the phone, where the drawer has its own trigger.
			-->
			{#if collapsible}
				<button
					type="button"
					onclick={toggleCollapsed}
					class="text-shell-muted-foreground hover:text-shell-foreground -ml-1 hidden size-8 flex-none place-items-center rounded-md transition-colors md:grid"
					aria-label={collapseLabel}
					aria-pressed={collapsed}
					title={`${collapseLabel} (press [)`}
					data-testid="ds-rail-collapse"
				>
					{#if collapsed}
						<PanelLeftOpen class="size-4" />
					{:else}
						<PanelLeftClose class="size-4" />
					{/if}
				</button>
				<span
					class="bg-border hidden h-4 w-px flex-none md:block"
					aria-hidden="true"
					data-testid="ds-rail-collapse-separator"
				></span>
			{/if}

			<!-- The rail carries the brand on md+; below md the rail is gone, so the
			     bar carries it or the app loses its identity on a phone entirely. -->
			<span class={hasNav ? 'flex md:hidden' : 'flex'}>
				{@render brandLockup(true)}
			</span>

			<!-- `min-w-0` is what lets a leading `context` snippet (a workspace
			     switcher, a breadcrumb) actually shrink under crowding — a flex
			     item's automatic `min-width: auto` otherwise floors it at its own
			     min-content size, so with search, actions and identity all also
			     competing for the bar the FIRST thing to run out of room was
			     whichever trailing control happened to sit last in source order
			     (theme, identity) — pushed edge-to-edge past the header's own
			     right edge and, with no horizontal scroll on the bar, permanently
			     unreachable rather than merely cramped (design-system#111). The
			     wordmark and the search button already carry their own shrink
			     behaviour (hiding text, going icon-only); `context` is the one
			     leading slot that never had to. -->
			{#if context}<div class="min-w-0">{@render context()}</div>{/if}

			<!-- Where you are, then the page's scope controls. Inline with the
			     rest of the bar from xl; below that, controls take a second row
			     of the bar, and a bare label shows from md and not on a phone. -->
			<!-- Where you are, then the page's scope controls. From sm they share one
			     row, inline from xl and on the bar's second row below it. On a phone
			     the wrapper steps aside (`contents`): the title takes the free room
			     of the first row, truncated, and the controls take the second row
			     whole. -->
			{#if location || controls.content}
				<div
					class={cn(
						'flex min-w-0 items-center gap-2 max-sm:contents sm:gap-3',
						controls.content && 'sm:order-last sm:basis-full xl:order-none xl:basis-auto'
					)}
					data-testid="ds-shell-location"
				>
					{#if location}
						<span
							class="text-shell-muted-foreground min-w-0 truncate text-sm max-sm:flex-1 max-sm:basis-0 sm:max-w-72"
							title={location}
							data-testid="ds-shell-title"
							>{#if shortName && shortName !== location}<span class="max-sm:hidden">{location}</span
								><span class="sm:hidden">{shortName}</span>{:else}{location}{/if}</span
						>
					{/if}
					{#if controls.content}
						<div
							class="flex min-w-0 items-center gap-2 max-sm:order-last max-sm:basis-full sm:gap-3"
							data-testid="ds-shell-controls"
						>
							{@render controls.content()}
						</div>
					{/if}
				</div>
			{/if}

			{#if onSearch && searchPlacement === 'leading'}
				{@render searchButton(
					'h-9 w-9 flex-none justify-center px-0 sm:h-auto sm:w-[clamp(200px,24vw,420px)] sm:flex-1 sm:justify-start sm:gap-2 sm:px-3 sm:py-1.5'
				)}
			{/if}

			<div class="ml-auto flex flex-none items-center gap-2 sm:gap-3">
				<!-- The page's own columns where they do not fit beside it: the pane
				     and the aside open as sheets from here, before everything the bar
				     carries on every page. -->
				{#if pane && !paneColumn}
					{@const Icon = pane.icon ?? PanelLeft}
					<button
						type="button"
						onclick={() => (paneSheetOpen = true)}
						class="border-border text-shell-muted-foreground hover:text-shell-foreground grid size-9 flex-none place-items-center rounded-md border transition-colors pointer-coarse:size-11"
						aria-label={pane.label}
						title={pane.label}
						aria-haspopup="dialog"
						aria-expanded={paneSheetOpen}
						data-testid="ds-page-pane-open"
					>
						<Icon class="size-4" />
					</button>
				{/if}
				{#if aside && asideMode === 'sheet'}
					{@const Icon = aside.icon ?? PanelRight}
					<button
						type="button"
						onclick={() => (asideSheetOpen = true)}
						class="border-border text-shell-muted-foreground hover:text-shell-foreground grid size-9 flex-none place-items-center rounded-md border transition-colors pointer-coarse:size-11"
						aria-label={aside.label}
						title={aside.label}
						aria-haspopup="dialog"
						aria-expanded={asideSheetOpen}
						data-testid="ds-page-aside-open"
					>
						<Icon class="size-4" />
					</button>
				{/if}

				{#if onSearch && searchPlacement === 'trailing'}
					{@render searchButton(
						'h-9 w-9 flex-none justify-center px-0 sm:h-auto sm:w-[clamp(180px,18vw,300px)] sm:justify-start sm:gap-2 sm:px-3 sm:py-1.5'
					)}
				{/if}

				<!-- Feedback has one home: here from md, the drawer's foot on a phone.
				     Shown only while a ReportWidget is mounted to open. -->
				{#if shellReport.open}
					<button
						type="button"
						onclick={() => shellReport.open?.()}
						class="border-border text-shell-muted-foreground hover:text-shell-foreground hidden size-9 flex-none place-items-center rounded-md border transition-colors md:grid"
						aria-label="Report a problem"
						title="Report a problem"
						data-testid="ds-shell-report"
					>
						<MessageSquarePlus class="size-4" />
					</button>
				{/if}

				{#if pageBar.current}
					<BarActions bar={pageBar.current} />
					<span class="bg-border hidden h-6 w-px flex-none sm:block" aria-hidden="true"></span>
				{/if}

				{#if actions}{@render actions()}{/if}

				{#if themeToggle}
					<button
						onclick={toggleTheme}
						class="border-border text-shell-muted-foreground hover:text-shell-foreground grid size-9 flex-none place-items-center rounded-md border transition-colors"
						aria-label="Toggle theme"
						data-testid="ds-shell-theme"
					>
						<Sun class="size-4 dark:hidden" />
						<Moon class="hidden size-4 dark:block" />
					</button>
				{/if}

				{#if identity}{@render identity()}{/if}
			</div>
		</header>

		{#if banner}{@render banner()}{/if}

		<div class="flex min-h-0 min-w-0 flex-1">
			<!--
				The scrolling content region, and the element a consumer's
				"no horizontal overflow" test must measure.

				`overflow-y: auto` makes `overflow-x` compute to `auto` too, so this
				box — not the document — is where a wide child's excess ends up. Every
				app's overflow check measures `document.documentElement.scrollWidth`,
				which is why one app carried 39px of sideways scroll at 375px with its
				suite green throughout: the number it was reading could not move.

				`data-slot` rather than the `id` for that: `ds-main` is the skip link's
				target and an app is free to have its own `#ds-main` ambitions, whereas
				the slot marker is the same stable hook every other component here
				exposes. `harness/drive.mjs` measures this element at 375px and 320px
				and prints the document-level number beside it, blind, for contrast.
			-->
			<!--
				`texture` paints the house atmosphere HERE, on the scroller itself,
				through `.ds-shell-texture` in styles.css. It is this element rather
				than the page frame below because the texture is the FLOOR the page
				sits on: a reading column is narrower than the region, and a floor that
				stopped at the column would be a stripe.

				It is a background rather than a layer, and that is the whole design
				rather than an implementation detail. An absolutely positioned child
				inside a scroller is the shape both surveyed apps reached for first and
				it is subtly wrong three ways: at `z-index: auto` a positioned box
				paints ABOVE non-positioned content, so the "atmosphere" tints the page
				(invisible only because it is faint); `z-index: -1` fixes that by
				sinking it behind an ancestor's background instead, since neither this
				element nor `.ds-shell` opens a stacking context; and it needs
				`pointer-events: none` to stop eating clicks. A background layer has
				none of those problems by construction — it cannot be hit-tested, it
				always paints beneath every descendant, it adds no box to the flex
				column, and it opens no stacking context. The one app that had already
				moved to a background did so after hitting exactly the first failure.

				`background-attachment: local` is what makes it the page's floor rather
				than a backdrop: the default (`scroll`) pins a scroll container's
				background to its border box, so the dots would sit frozen while the
				content slid over them. `harness/drive.mjs` proves the difference by
				scrolling half a grid pitch and comparing pixels, with `scroll` forced
				on as the control.
			-->
			<main
				id="ds-main"
				data-slot="app-shell-content"
				tabindex="-1"
				class={cn(
					'ds-shell-main relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto',
					textured && 'ds-shell-texture'
				)}
				data-texture={textured ?? undefined}
			>
				<!--
					The page's frame: one element whose type the route declared. Every
					width, gutter and column is `.ds-page` in styles.css, read from
					`data-page`, and no utility here: an arbitrary utility only exists if
					the consumer's Tailwind build scanned this file. `data-aside` says
					where the aside stands, `data-fill` that the content beside a pane
					fills the frame.
				-->
				<div
					class="ds-page"
					data-page={type}
					data-aside={asideMode === 'sheet' ? undefined : (asideMode ?? undefined)}
					data-fill={pane?.fill ? '' : undefined}
				>
					{#if pane && paneColumn}
						<!-- The body names itself (a list's own section, AppNav's nav). -->
						<div
							class="ds-page-pane"
							data-folded={paneState.folded ? 'true' : undefined}
							data-testid="ds-page-pane"
						>
							<ColumnScope>
								{#if paneState.folded && pane.folded}
									{@render pane.folded(paneState)}
								{:else}
									<div class="ds-page-pane-body">{@render pane.body(paneState)}</div>
									{#if pane.foot}
										<div class="ds-page-pane-foot">{@render pane.foot(paneState)}</div>
									{/if}
								{/if}
							</ColumnScope>
						</div>
					{/if}
					<div class="ds-page-main" data-slot="page-main">
						{@render children()}
					</div>
					{#if aside && asideMode !== 'sheet'}
						<aside class="ds-page-aside" aria-label={aside.label} data-testid="ds-page-aside">
							<ColumnScope>{@render aside.body(asideState)}</ColumnScope>
						</aside>
					{/if}
				</div>
			</main>
		</div>
	</div>
</div>

<!-- The page's columns as sheets, where they do not fit beside the content. -->
{#if pane && !paneColumn}
	<Sheet.Root open={paneSheetOpen} onOpenChange={(open) => (paneSheetOpen = open)}>
		<Sheet.Content side="left" showCloseButton={false} aria-label={pane.label} class="gap-0">
			<ColumnScope>
				<div class="ds-page-pane-body">{@render pane.body(paneState)}</div>
				{#if pane.foot}
					<div class="ds-page-pane-foot">{@render pane.foot(paneState)}</div>
				{/if}
			</ColumnScope>
		</Sheet.Content>
	</Sheet.Root>
{/if}
{#if aside && asideMode === 'sheet'}
	<Sheet.Root open={asideSheetOpen} onOpenChange={(open) => (asideSheetOpen = open)}>
		<Sheet.Content side="right" aria-label={aside.label} class="gap-0">
			<Sheet.Header>
				<Sheet.Title>{aside.label}</Sheet.Title>
				{#if aside.description}<Sheet.Description>{aside.description}</Sheet.Description>{/if}
			</Sheet.Header>
			<div class="ds-page-aside-sheet">
				<ColumnScope>{@render aside.body(asideState)}</ColumnScope>
			</div>
		</Sheet.Content>
	</Sheet.Root>
{/if}
