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
	 * navigation and a brand row that also carries the collapse toggle, PLUS a
	 * real top navbar (search, leading/trailing slots, theme toggle, identity) —
	 * always both together. Operator ruling, 31/07/2026: every household app
	 * renders one shell shape; apps do not choose variants.
	 *
	 * The collapse toggle sits at the rail's own top edge, on the brand row,
	 * where every comparable shell puts a control that acts on the rail — icon
	 * only, right of the wordmark, stacking under the mark when the rail is
	 * collapsed. The foot is left to the app.
	 *
	 * Search can sit in either of two places, because it reads as a different
	 * thing depending on what is beside it. `searchPlacement` defaults to
	 * `leading` — its historical spot just after the `context` slot, so a shell
	 * that never names the prop is unchanged — and `trailing` moves it into the
	 * right-hand group with the theme toggle and identity, so that when `context`
	 * carries route content the global affordance reads as global rather than as
	 * part of the switcher next to it.
	 *
	 * Content WIDTH is the one dimension that came back, as `measure`, and it
	 * came back on a measurement rather than on taste. "Always full-width" did
	 * not remove the decision, it pushed it down into every page: a consumer was
	 * surveyed at 2560px and had six distinct caps across nine routes, every one
	 * of them a hand-written `mx-auto max-w-*` at the top of a `+page.svelte`,
	 * between them using 15% to 79% of the width actually available. That is
	 * fifteen independent guesses, not a shell shape.
	 *
	 * `measure` is a small named scale, chosen once in the layout, and it is not
	 * the old `content` prop returning. It defaults to `full`, so a shell that
	 * never mentions it renders byte-identically; its tiers are CSS custom
	 * properties an app retunes without a release; and it exists to REPLACE
	 * per-page width decisions rather than to offer an app a look.
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
	import type { ShellMeasure } from './measure.js';
	import type { ShellTexture } from './texture.js';
	import { toggleMode } from 'mode-watcher';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	import AppNav from './app-nav.svelte';
	import { activeNavLabel, toItems, type NavSource } from './types.js';
	import { provideShellControls, type ShellControlsSlot } from './controls.js';
	import { cn } from '$lib/utils.js';

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
		settingsHref,
		settingsLabel = 'Settings',
		onSearch,
		searchLabel = 'Search…',
		searchShortcut = '⌘K',
		searchPlacement = 'leading',
		themeToggle = true,
		onToggleTheme,
		padded = true,
		measure = 'full',
		texture = 'grid',
		mainClass,
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
		 * Offer an icon-only collapse toggle at the rail head, on the brand row.
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
		/** Where the Settings row at the rail's foot links. Absent renders no row.
		 *  Settings sits at the foot because configuring the app is not navigating
		 *  it, and the split reads without a label.
		 *
		 *  The app's version does NOT live beside it. A build string earns rail
		 *  space only if it saves a trip, and it does not: Settings is on screen
		 *  at every moment and its About section is one click from here, so the
		 *  line was permanent furniture duplicating the thing directly above it. */
		settingsHref?: string;
		settingsLabel?: string;
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
		padded?: boolean;
		/**
		 * How wide the page body may get, from a named scale: `prose` (72ch, for
		 * long-form running text), `page` (80rem — forms, detail views,
		 * settings), `wide` (120rem — indexes, grids, tables, dashboards), or
		 * `full` (no cap).
		 *
		 * Defaults to `full`, so a shell that does not mention it is unchanged.
		 * Set it in the layout, once: the point is that pages stop each deciding
		 * their own width. The cap is the content box's border box, so `padded`
		 * spends its padding inside the measure.
		 */
		measure?: ShellMeasure;
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
		/** Extra classes on the scrolling content container. */
		mainClass?: string;
		children: Snippet;
	} = $props();

	const hasNav = $derived(toItems(nav).length > 0);

	// Where the user is, in words: the rail is icons when collapsed and a closed
	// drawer on a phone, so the bar names the section.
	const location = $derived(activeNavLabel(nav, currentPath));

	// The page's scope controls, registered by `<ShellControls>` from the route.
	const controls: ShellControlsSlot = $state({ content: null });
	provideShellControls(controls);

	// Rail width is a personal preference: localStorage, one key across apps.
	// A drag below RAIL_SNAP collapses; the width survives and returns on expand.
	const RAIL_KEY = 'ds-shell-rail-width';
	const RAIL_MIN = 200;
	const RAIL_MAX = 420;
	const RAIL_SNAP = 170;
	const RAIL_STEP = 16;
	let railWidth = $state<number | null>(null);
	let resizing = $state(false);
	$effect(() => {
		try {
			const stored = Number(localStorage.getItem(RAIL_KEY));
			if (stored >= RAIL_MIN && stored <= RAIL_MAX) railWidth = stored;
		} catch {
			/* storage unavailable: the default width stands */
		}
	});
	function clampRail(next: number) {
		return Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(next)));
	}
	function setRailWidth(next: number) {
		railWidth = clampRail(next);
		try {
			localStorage.setItem(RAIL_KEY, String(railWidth));
		} catch {
			/* storage unavailable: the width lasts the session */
		}
	}
	function startResize(event: PointerEvent) {
		const handle = event.currentTarget as HTMLElement;
		const rail = handle.parentElement as HTMLElement;
		const startX = event.clientX;
		const startWidth = rail.getBoundingClientRect().width;
		const before = railWidth;
		resizing = true;
		handle.setPointerCapture(event.pointerId);
		const move = (e: PointerEvent) => {
			const next = startWidth + (e.clientX - startX);
			if (next < RAIL_SNAP) {
				// A collapse keeps the width it had; only a resize stores one.
				railWidth = before;
				collapsed = true;
				stop();
			} else {
				railWidth = clampRail(next);
			}
		};
		const stop = () => {
			resizing = false;
			if (!collapsed && railWidth !== null) setRailWidth(railWidth);
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('pointerup', stop);
			handle.removeEventListener('pointercancel', stop);
			if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
		};
		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', stop);
		handle.addEventListener('pointercancel', stop);
	}
	function resizeByKey(event: KeyboardEvent) {
		const current = railWidth ?? RAIL_MIN + (RAIL_MAX - RAIL_MIN) / 4;
		if (event.key === 'ArrowLeft') setRailWidth(current - RAIL_STEP);
		else if (event.key === 'ArrowRight') setRailWidth(current + RAIL_STEP);
		else if (event.key === 'Home') resetRailWidth();
		else if (event.key === 'End') setRailWidth(RAIL_MAX);
		else return;
		event.preventDefault();
	}
	/** Back to the package default (Home, or a double-click on the handle). */
	function resetRailWidth() {
		railWidth = null;
		try {
			localStorage.removeItem(RAIL_KEY);
		} catch {
			/* storage unavailable */
		}
	}

	// The measure is resolved ONCE, and the class and the attribute both read
	// that one answer. Two independently-worded conditionals looked symmetric
	// and were not: Svelte omits an attribute whose value is `null`, while a
	// class token under the same test survives, so `measure={null}` — which the
	// type forbids but a loosely-typed prop bag or a nullable route field can
	// still deliver — produced the class with no attribute and therefore no
	// matching rule. Harmless to look at, but it breaks the DOM contract the
	// additivity gate states, and a guarantee with a hole in it is not one.
	const capped = $derived(measure != null && measure !== 'full' ? measure : null);

	// The texture resolves the same way, and for the same reason: one answer
	// feeding both the class and the attribute, so `texture={null}` from a
	// loosely-typed prop bag cannot produce a class with no matching rule.
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
	// out — the Collapse control is `md:flex` and does not render at that width.
	// Nesting did not cause that, it raised the stakes: a collapsed rail renders
	// no children, so the phone would have lost the sub-navigation entirely.
	// `mobileNavOpen` implies narrow (the matchMedia effect below is what earns
	// that), so this can never suppress a legitimate desktop collapse.
	const railCollapsed = $derived(collapsible && collapsed && !mobileNavOpen);

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
		// Drop what CSS has hidden — the collapse control is display:none below md
		// and must not be a tab stop. `getClientRects()` is the check that works
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
			collapsed = !collapsed;
		}
	}}
/>

{#snippet brandLockup(compact = false)}
	<a
		href={homeHref}
		class={cn(
			'flex flex-none items-center gap-2.5',
			compact ? '' : 'h-14 px-4',
			railCollapsed && !compact && 'justify-center px-0'
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
			{#if brandTitle && !railCollapsed}
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
				<span class="font-display text-body hidden font-semibold tracking-tight sm:inline"
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
			data-resizing={resizing ? 'true' : undefined}
			data-drawer={mobileNavOpen ? 'true' : undefined}
			data-testid={mobileNavOpen ? 'ds-shell-drawer' : undefined}
			role={mobileNavOpen ? 'dialog' : undefined}
			aria-modal={mobileNavOpen ? 'true' : undefined}
			aria-label={mobileNavOpen ? 'Navigation' : undefined}
			onkeydown={trapTab}
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

			<!--
				The collapse toggle rides the brand row, at the rail's own top edge —
				where a control that acts on the rail belongs (Notion, Linear, GitHub's
				newer nav all put it there), rather than a full-width labelled row at
				the foot that read as a navigation destination. Expanded, it sits right
				of the wordmark (`ml-auto`); collapsed, the head has no room beside the
				mark, so the row becomes a column and the toggle stacks under it,
				centred. `md:grid` keeps it off the mobile drawer, where collapse does
				not apply — the same reason the foot control carried `md:flex`.
			-->
			{#if collapsible}
				<div class={cn('flex items-center', railCollapsed ? 'flex-col gap-1 py-2' : 'pr-2')}>
					{@render brandLockup()}
					<button
						type="button"
						onclick={() => (collapsed = !collapsed)}
						class={cn(
							'text-shell-muted-foreground hover:text-shell-foreground hidden size-8 flex-none place-items-center rounded-md transition-colors md:grid',
							!railCollapsed && 'ml-auto'
						)}
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
				</div>
			{:else}
				{@render brandLockup()}
			{/if}
			<AppNav
				{nav}
				{currentPath}
				collapsed={railCollapsed}
				label={navLabel}
				onNavigate={() => (mobileNavOpen = false)}
			/>

			<!--
				The rail's foot. `mt-auto` pins it under the nav however short the
				section list is, so it sits on the rail's bottom edge rather than
				trailing the last section. Two things live here and nothing else:
				where you configure the app, and which build you are looking at.

				Settings is a nav row like any other and takes the same active and
				hover treatment, because it IS a destination — it is last rather
				than separate because configuring the app is not navigating it.
				The version is not a row: no icon, no tile, no hover, one muted
				line, so it reads as metadata and never competes for a click.
			-->
			{#if settingsHref}
				<div class="ds-shell-rail-foot mt-auto">
					<a
						href={settingsHref}
						class="ds-nav-item"
						aria-current={currentPath?.startsWith(settingsHref) ? 'page' : undefined}
						onclick={() => (mobileNavOpen = false)}
					>
						<Settings class="ds-nav-icon size-[1.125rem] flex-none" aria-hidden="true" />
						<span class={railCollapsed && !mobileNavOpen ? 'sr-only' : 'truncate'}>
							{settingsLabel}
						</span>
					</a>
				</div>
			{/if}
			{#if collapsible && !railCollapsed && !mobileNavOpen}
				<!-- The rail's right edge: drag to resize, drag past the snap to
				     collapse, arrows to nudge, Home to reset, double-click to reset.
				     A focusable separator is the ARIA window-splitter pattern. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<div
					role="separator"
					aria-orientation="vertical"
					aria-label="Resize sidebar"
					aria-valuenow={railWidth ?? undefined}
					aria-valuemin={RAIL_MIN}
					aria-valuemax={RAIL_MAX}
					tabindex="0"
					class="ds-shell-rail-handle"
					onpointerdown={startResize}
					onkeydown={resizeByKey}
					ondblclick={resetRailWidth}
					data-testid="ds-rail-resize"
				></div>
			{/if}
		</aside>
	{/if}

	<div class="flex min-h-0 min-w-0 flex-1 flex-col">
		<header
			class="ds-shell-bar bg-shell/80 text-shell-foreground border-border sticky top-0 z-20 flex min-h-14 flex-none flex-wrap items-center gap-2 border-b px-3 pt-[env(safe-area-inset-top)] backdrop-blur sm:gap-3 sm:px-5 xl:flex-nowrap"
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
			{#if location || controls.content}
				<div
					class={cn(
						'flex min-w-0 items-center gap-2 sm:gap-3',
						controls.content
							? 'order-last basis-full pb-2 xl:order-none xl:basis-auto xl:pb-0'
							: 'hidden md:flex'
					)}
					data-testid="ds-shell-location"
				>
					{#if location}
						<span class="text-shell-muted-foreground max-w-48 flex-none truncate text-sm"
							>{location}</span
						>
					{/if}
					{#if controls.content}{@render controls.content()}{/if}
				</div>
			{/if}

			{#if onSearch && searchPlacement === 'leading'}
				{@render searchButton(
					'h-9 w-9 flex-none justify-center px-0 sm:h-auto sm:w-[clamp(200px,24vw,420px)] sm:flex-1 sm:justify-start sm:gap-2 sm:px-3 sm:py-1.5'
				)}
			{/if}

			<div class="ml-auto flex flex-none items-center gap-2 sm:gap-3">
				{#if onSearch && searchPlacement === 'trailing'}
					{@render searchButton(
						'h-9 w-9 flex-none justify-center px-0 sm:h-auto sm:w-[clamp(180px,18vw,300px)] sm:justify-start sm:gap-2 sm:px-3 sm:py-1.5'
					)}
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
				than the content box below because the texture is the FLOOR the page
				sits on: capped by `measure`, that box is narrower than the region, and
				a floor that stopped at the measure would be a stripe.

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
					'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto',
					textured && 'ds-shell-texture',
					mainClass
				)}
				data-texture={textured ?? undefined}
			>
				<!--
					`min-w-0` on a flex child, for the same reason `<main>` and both
					boxes above it carry it: a flex item's default `min-width: auto` can
					size it by its own min-content rather than by its container.

					Measured rather than assumed, and the measurement is worth writing
					down because it contradicts the obvious reading: in THIS structure
					the declaration is currently INERT. The automatic minimum size
					applies to a flex item's MAIN axis, and `<main>` is a column, so this
					box's width is already cross-axis stretch and cannot grow past its
					container. Driving the harness at 375px and 320px, with and without
					the declaration, against a plain page wrapper and an `mx-auto` one,
					moved nothing — `harness/drive.mjs` pins that.

					It stays because it is the correct declaration for the box, and
					because the day this container becomes a row item the omission would
					be invisible all over again. What it is NOT is the cause of the
					sideways scroll in #5: that comes from a child with no scroller of
					its own, which no sizing rule here can prevent — only the child
					carrying its own scroller can, as this package's Table does. The half
					of that defect the shell genuinely owns is on `<main>` above.
				-->
				<!--
					`measure` caps and centres this box, through `.ds-shell-measure`
					in styles.css rather than a utility here — an arbitrary
					`max-w-[var(…)]` only exists if the consumer's Tailwind build
					scanned the file spelling it, and a cap that silently does not
					compile is the failure mode this package gates against everywhere
					else.

					At `full` the class and the attribute are both ABSENT, not set to
					a no-op value. That is what makes the prop additive: a consumer
					who never names it gets the same element, the same class string
					and the same declarations as before it existed, so there is
					nothing for the cascade to resolve differently. Both read the
					single `capped` answer above, so they cannot disagree.
				-->
				<div
					class={cn(
						'flex min-h-0 min-w-0 flex-1 flex-col',
						'w-full',
						capped && 'ds-shell-measure',
						padded &&
							'px-4 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 md:px-8 md:pt-7 md:pb-[calc(1.75rem+env(safe-area-inset-bottom))] 2xl:px-12'
					)}
					data-measure={capped ?? undefined}
				>
					{@render children()}
				</div>
			</main>
		</div>
	</div>
</div>
