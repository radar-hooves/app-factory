/**
 * Page types: what a route is, declared once, and everything about its width,
 * gutters and second columns decided here rather than on the page.
 *
 * - `reading` (the default): one centred column sized for prose, and the
 *   page's aside (`<PageAside>`) beside it, the pair centred; below 66rem of
 *   content region the aside follows the column. The page scrolls.
 * - `panel`: a second column (`<PagePane>`: settings' sections, a chat's past
 *   questions) flush against the rail, and the content beside it, left-aligned
 *   to the pane. Below 64rem of window the pane opens as a sheet from the bar.
 * - `tool`: the whole frame, the content filling its height and scrolling
 *   inside itself; the page never scrolls. An aside stands at the frame's
 *   right edge, and below 80rem of window opens as a sheet from the bar.
 *
 * The widths are `--ds-page-*` custom properties (`styles.css`), so an app
 * retunes one in one declaration; it never writes a width of its own.
 */
import { getContext, setContext, type Snippet } from 'svelte';
import type { IconComponent } from './types.js';

export type PageType = 'reading' | 'panel' | 'tool';

/** Every page type, the default first. */
export const PAGE_TYPES = ['reading', 'panel', 'tool'] as const satisfies readonly PageType[];

/** Where a pane or an aside is drawn just now, and how to put it away. */
export interface PageColumnState {
	/** `column` beside the content, `sheet` over it from the bar, `stacked` after it (a reading aside). */
	mode: 'column' | 'sheet' | 'stacked';
	/** Whether a foldable pane is folded to its edge. */
	folded: boolean;
	/** Fold the pane to its edge; a no-op where it does not fold. */
	fold: () => void;
	/** Open a folded pane. */
	unfold: () => void;
	/** Close the sheet; a no-op in a column. */
	close: () => void;
}

export interface PagePaneRegistration {
	/** The pane's name: its landmark's, and the bar action's that opens it as a sheet. */
	label: string;
	/** The bar action's icon. */
	icon?: IconComponent;
	/** What the bar names while this pane's page is open, when the rail names nothing. */
	location?: string;
	/** The column's body. */
	body: Snippet<[PageColumnState]>;
	/** Pinned at the pane's foot, open or in the sheet. */
	foot?: Snippet<[PageColumnState]>;
	/** What the pane shows folded to its edge; given, the pane folds. */
	folded?: Snippet<[PageColumnState]>;
	/** The localStorage key the fold is remembered under. */
	remember?: string;
	/** The content beside the pane fills the frame (a transcript), rather than sitting at the panel measure. */
	fill?: boolean;
	/** Told whether the shell draws the pane as a column or keeps it in a sheet. */
	onmode?: (mode: 'column' | 'sheet') => void;
}

export interface PageAsideRegistration {
	/** The aside's name: its landmark's, and the bar action's that opens it as a sheet. */
	label: string;
	/** A line under the name at the head of the sheet. */
	description?: string;
	icon?: IconComponent;
	body: Snippet<[PageColumnState]>;
}

/** The shell's two page-owned columns, each registered by the route. */
export interface PageSlots {
	pane: PagePaneRegistration | null;
	aside: PageAsideRegistration | null;
}

const KEY = Symbol('ds-page-slots');
const IN_COLUMN = Symbol('ds-page-in-column');

export function providePageSlots(slots: PageSlots): void {
	setContext(KEY, slots);
}

/** Undefined outside a shell: `PagePane` and `PageAside` then render in place. */
export function getPageSlots(): PageSlots | undefined {
	return getContext<PageSlots | undefined>(KEY);
}

/** Marks the subtree as inside a page column or a dialogue (`ColumnScope`). */
export function markInColumn(): void {
	setContext(IN_COLUMN, true);
}

/** Whether this component stands in the page itself, not in one of its columns or a dialogue. */
export function onThePage(): boolean {
	return getPageSlots() !== undefined && getContext<boolean | undefined>(IN_COLUMN) !== true;
}

/** A column's state where nothing hosts it: in place, open. */
export const IN_PLACE: PageColumnState = {
	mode: 'stacked',
	folded: false,
	fold: () => {},
	unfold: () => {},
	close: () => {}
};
