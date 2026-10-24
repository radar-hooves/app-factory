/**
 * The page's scope controls in the shell's top bar: what changes the view of
 * the page you are on (an entity, a financial year, chart/table) and never
 * navigates. Sub-routes are the rail's (`NavItem.children`), never here.
 *
 * Controls belong to a route and the shell is composed once above every
 * route, so the shell holds a mutable slot in context; `<ShellControls>` in a
 * page registers its children on mount and withdraws them on unmount. One
 * registration at a time; a later one replaces an earlier one.
 */
import { getContext, setContext, type Component, type Snippet } from 'svelte';

const KEY = Symbol('ds-shell-controls');

export interface ShellControlsSlot {
	content: Snippet | null;
}

export function provideShellControls(slot: ShellControlsSlot): void {
	setContext(KEY, slot);
}

/** Undefined outside a shell: `ShellControls` then renders nothing. */
export function getShellControls(): ShellControlsSlot | undefined {
	return getContext<ShellControlsSlot | undefined>(KEY);
}

/**
 * One of the page's own actions in the top bar: a download, an export, a
 * "new". From `sm` up the shell draws each as a labelled button; below it they
 * fold into one "More actions" menu, so they never take the title's room.
 */
export interface BarAction {
	label: string;
	icon: Component<{ class?: string }>;
	/** A link, or a file to download when `download` is set. */
	href?: string;
	download?: boolean;
	onclick?: () => void;
	/** The page's one primary action takes the accent. */
	primary?: boolean;
	/** What the label leaves out (a file's size), as the tooltip. */
	detail?: string;
}

/** The page's status and actions in the bar, registered by `<ShellActions>`. */
export interface BarActionsSlot {
	status?: string;
	actions: readonly BarAction[];
}

const ACTIONS_KEY = Symbol('ds-shell-actions');

export interface ShellActionsHolder {
	current: BarActionsSlot | null;
}

export function provideShellActions(holder: ShellActionsHolder): void {
	setContext(ACTIONS_KEY, holder);
}

export function getShellActions(): ShellActionsHolder | undefined {
	return getContext<ShellActionsHolder | undefined>(ACTIONS_KEY);
}
