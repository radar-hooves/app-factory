import type { IconComponent } from '../app-shell/types.js';

/**
 * One action a list or a pane offers: a button, or a link when it has `href`.
 * As an icon action its `label` is the tooltip and the accessible name.
 */
export interface ListAction {
	label: string;
	icon?: IconComponent;
	onclick?: (event: MouseEvent) => void;
	href?: string;
	/** On a link, saves the target rather than opening it; a string names the file. */
	download?: boolean | string;
	disabled?: boolean;
}

/** An action drawn as its icon alone. */
export type ListIconAction = ListAction & { icon: IconComponent };
