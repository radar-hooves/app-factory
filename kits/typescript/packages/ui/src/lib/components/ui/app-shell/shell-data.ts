/**
 * What an app declares about its shell: data, never markup. The factory's frame
 * (the template's `app-frame.svelte`) reads it and lays the rail, the sidebar
 * and the page frame out to the operator's ruling of 03/11/2026: "Apps just
 * declare what they need in the sidebar... Apps own their own domain logic and
 * what they put on the screens, not what the screens look like."
 *
 *     export const shell: ShellData<typeof auth> = {
 *       workspaceLabel: 'Household',
 *       brand: { title: 'Casefile', mark: Folder },
 *       nav: (viewer) => [
 *         { items: [{ label: 'Matters', href: '/matters', icon: FolderOpen }] },
 *         ...(viewer.can('admin') ? [{ items: [{ label: 'Access', href: '/access' }] }] : [])
 *       ]
 *     };
 *
 * What a screen is rides its route's load data, not this file: `pageType`
 * (`reading`, `panel`, `tool` or `bare`, page.ts), `title` (the last crumb) and,
 * for a detail deeper than the rail's row, `breadcrumbs`.
 */
import type { IconComponent, NavSource } from './types.js';

/** One extra row in the account menu, beside the Settings item every app has. */
export interface ShellAccountLink {
	label: string;
	/** Where it goes. */
	href: string;
	icon?: IconComponent;
	/** Shown only to a caller holding `admin`. */
	admin?: boolean;
}

export interface ShellData<Viewer = never> {
	/** What this app calls a workspace ("Household"): the menu, the members page and the chooser read it. */
	workspaceLabel: string;
	brand: {
		/** The wordmark text, and the home link's accessible name. */
		title: string;
		/** The mark beside the wordmark: a component taking a `class`. */
		mark?: IconComponent;
		/** Where the brand links. Default `/`. */
		homeHref?: string;
	};
	/**
	 * The rail's navigation: bare items, groups, or a mix, or a function of the
	 * signed-in viewer for rows that depend on who they are. Empty until the
	 * viewer is known if the function says so; the shell knows nothing of
	 * permissions.
	 */
	nav: NavSource | ((viewer: Viewer) => NavSource);
	/** The rail starts folded to icons, until the reader opens it. Default open. */
	railCollapsed?: boolean;
	/** Extra rows in the account menu, after Settings. */
	accountLinks?: readonly ShellAccountLink[];
}

/** The nav as the frame renders it, whichever way the app declared it. */
export function resolveNav<Viewer>(shell: ShellData<Viewer>, viewer: Viewer): NavSource {
	return typeof shell.nav === 'function' ? shell.nav(viewer) : shell.nav;
}
