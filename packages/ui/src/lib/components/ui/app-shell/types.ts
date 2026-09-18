/**
 * The navigation vocabulary every app types its own config against.
 *
 * Five apps in the estate were surveyed before this shape was settled, and each
 * had reinvented the same three fields under different names (`label`/`title`,
 * `href`/`path`) plus one or two extras nobody else had. The intersection —
 * label, href, icon — is what every one of them actually needed; `badge`,
 * `exact` and `external` are the union of the genuine extras, each optional so
 * the common case stays two fields.
 *
 * Deliberately ABSENT: any notion of who may see an item. Two apps gate nav on
 * `is_admin` / per-module permission, and both do it with their own auth store.
 * A shared package that knew about permissions would have to know about auth,
 * which is exactly the coupling that made the reference shell unliftable. Apps
 * filter before they pass:
 *
 *     const nav = $derived(allNav.filter((i) => !i.adminOnly || user.isAdmin));
 */
import type { Component } from 'svelte';

/** A Lucide (or equivalent) icon component: takes a class, renders an SVG. */
export type IconComponent = Component<{ class?: string }>;

/** One navigable destination. */
export interface NavItem {
	/** The visible text. Also the accessible name when the rail is collapsed. */
	label: string;
	/** Destination path. */
	href: string;
	/** Optional leading icon. Omit it for a label-only row; alignment is kept. */
	icon?: IconComponent;
	/** Optional trailing count or short tag (an unread count, a "beta" tag). */
	badge?: string | number;
	/**
	 * Match the current path exactly rather than by prefix. Prefix is the
	 * default because a section root should stay lit while you are inside it;
	 * `href: '/'` is always treated as exact, since every path is prefixed by it.
	 */
	exact?: boolean;
	/** Open in a new tab. Renders the standard rel and an off-site affordance. */
	external?: boolean;
	/**
	 * Additional path prefixes this item also owns, beyond its own `href`.
	 *
	 * Flat navigation has every section's children living under the section's
	 * own path, which `href`'s prefix match already covers. It breaks for a
	 * section whose children live under a different top-level route — a
	 * "browse" list whose detail pages sit at their own short URL rather than
	 * nested under the list. Each prefix here is matched exactly like `href`
	 * is (prefix, with the same path-segment boundary), independently of
	 * `exact` and independently of `href` being forced to exact at `/`: a root
	 * item can still claim an additional prefix by full path match.
	 */
	matchPrefixes?: string[];
	/**
	 * A section's own sub-navigation, disclosed in place beneath it.
	 *
	 * Without this, an app whose sections have their own inner navigation has
	 * nowhere to put it inside the rail. The observed workaround was modules in
	 * `nav` and the current module's pages in AppShell's `sidebar` snippet — two
	 * left-hand columns on a desktop, and, the reason this shape won over moving
	 * modules to a top bar, two surfaces on a phone that both want the same
	 * hamburger. One nested tree collapses to one drawer. That slot is gone as
	 * of 2026.8.11 and this is the only way in, so a section's navigation is in
	 * the same place in every app and on every route.
	 *
	 * Named `children`, not `items`, for a mechanical reason as well as a
	 * readable one: `isNavGroup` narrows on `'items' in entry`, so an item
	 * carrying `items` would be misread as a GROUP by every consumer of this
	 * vocabulary, this package's own renderer included.
	 *
	 * ONE level, and the type is what enforces it: a child is `NavItem` minus
	 * this field, so a second nesting is a compile error where the nav is
	 * authored rather than a rail nobody can read. The cap is deliberate. The
	 * rail is 15.5rem and every level costs an indent; by depth three the label
	 * has less room than the chevron beside it. Every household case is one
	 * level, and a genuinely deeper tree belongs in the page body, which has the
	 * width for it.
	 */
	children?: readonly NavChildItem[];
}

/**
 * A row inside a parent's disclosure: everything an item is, minus the ability
 * to nest again.
 */
export type NavChildItem = Omit<NavItem, 'children'>;

/** A titled run of items. The heading is optional — a leading group usually has none. */
export interface NavGroup {
	heading?: string;
	items: NavItem[];
}

/**
 * What the `nav` prop accepts: bare items, groups, or a mix.
 *
 * Three of the five surveyed apps have flat navigation and two have groups, so
 * requiring one shape would have made three apps write `[{ items: [...] }]`
 * wrapper noise or two apps flatten away their headings. A mixed array costs one
 * type guard here and nothing at the call site.
 */
export type NavEntry = NavItem | NavGroup;
export type NavSource = readonly NavEntry[];

/** Narrow a mixed entry to a group. */
export function isNavGroup(entry: NavEntry): entry is NavGroup {
	return 'items' in entry && Array.isArray((entry as NavGroup).items);
}

/** Normalise any accepted shape to groups, dropping groups that would render empty. */
export function toGroups(nav: NavSource | undefined): NavGroup[] {
	if (!nav) return [];
	const groups: NavGroup[] = [];
	// Consecutive bare items collapse into one unheaded run, so a flat array
	// renders as a single group rather than one group per item (which would
	// space every link apart). A group entry closes the run.
	let run: NavGroup | null = null;
	for (const entry of nav) {
		if (isNavGroup(entry)) {
			run = null;
			if (entry.items.length > 0) groups.push(entry);
		} else {
			if (!run) {
				run = { items: [] };
				groups.push(run);
			}
			run.items.push(entry);
		}
	}
	return groups;
}

/** No allocation per call for the overwhelmingly common childless item. */
const NO_CHILDREN: readonly NavChildItem[] = [];

/** An item's disclosed rows, normalised — an empty list where there are none. */
export function navChildren(item: NavItem): readonly NavChildItem[] {
	return item.children ?? NO_CHILDREN;
}

/**
 * Every item in source order, ignoring grouping — a parent immediately followed
 * by its own children, each destination appearing ONCE. Used by the command
 * palette.
 *
 * Children are included because they are destinations like any other, and the
 * palette is the fastest route to a page three levels into a section. An item
 * with no children flattens exactly as it always did.
 *
 * The de-duplication is not tidiness. A section that discloses its own pages
 * names its landing page twice by nature — the parent row goes there, and the
 * section's first child row is that same page under its own name ("Property",
 * then "Dashboard"). Both rows are wanted in the rail, where they render in
 * different `{#each}` blocks; flattened they collide, and every consumer keys
 * this list by `href`, so Svelte throws `each_key_duplicate` and the throw
 * takes the palette's whole content with it. Measured in a consumer: ⌘K opened
 * an empty sheet on every module route until the app hand-filtered its own nav
 * before passing it. An app should not have to know that.
 *
 * First occurrence wins, so the surviving entry is the parent's — the row
 * carrying the section's own name, which is what someone typing into a palette
 * is looking for.
 */
export function toItems(nav: NavSource | undefined): NavItem[] {
	if (!nav) return [];
	const seen = new Set<string>();
	const items: NavItem[] = [];
	for (const entry of nav) {
		for (const item of isNavGroup(entry) ? entry.items : [entry]) {
			for (const candidate of [item, ...navChildren(item)]) {
				if (seen.has(candidate.href)) continue;
				seen.add(candidate.href);
				items.push(candidate);
			}
		}
	}
	return items;
}

/** Prefix-match `path` against `prefix`, without running past a path segment. */
export function matchesPrefix(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(prefix + '/');
}

/**
 * Whether `item` is the current page.
 *
 * Prefix matching is what makes a section root stay lit on its children; the
 * `+ '/'` is what stops `/audit` lighting up on `/audit-log`. A root href is
 * forced to exact or it would match every path in the app — but that forcing
 * applies only to `href` itself; `matchPrefixes` is always prefix-matched, so
 * a root item can still claim a second, unrelated section by full path.
 */
export function isNavItemActive(item: NavItem, currentPath: string | undefined): boolean {
	if (!currentPath) return false;
	const ownMatch =
		item.exact || item.href === '/'
			? currentPath === item.href
			: matchesPrefix(currentPath, item.href);
	if (ownMatch) return true;
	return (item.matchPrefixes ?? []).some((prefix) => matchesPrefix(currentPath, prefix));
}

/**
 * Whether one of `item`'s disclosed children is the current page.
 *
 * Two things read this. It is what auto-opens the group you have navigated
 * into — a rail that will not show you where you are is the defect this whole
 * feature exists to avoid. And it marks a parent whose section you are inside
 * but whose own `href` does not match, which flat prefix matching cannot see
 * when the children live at their own top-level routes.
 */
export function hasActiveNavChild(item: NavItem, currentPath: string | undefined): boolean {
	if (!currentPath) return false;
	return navChildren(item).some((child) => isNavItemActive(child, currentPath));
}

/**
 * The label of where the user is: the active child's where one matches, else
 * the active item's. Undefined when nothing matches, so an unlisted route
 * renders no label rather than a wrong one.
 */
export function activeNavLabel(
	nav: NavSource | undefined,
	currentPath: string | undefined
): string | undefined {
	if (!currentPath) return undefined;
	for (const item of toItems(nav)) {
		const child = navChildren(item).find((c) => isNavItemActive(c, currentPath));
		if (child) return child.label;
		if (isNavItemActive(item, currentPath)) return item.label;
	}
	return undefined;
}
