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
import { getContext, setContext, type Snippet } from 'svelte';

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
