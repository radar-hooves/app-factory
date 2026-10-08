/**
 * The ledger's look, held once for every list that wears it: the Ledger and
 * the RecordList. A head card, row cards with hairlines between rows, and each
 * group's label on the page ground.
 */

/**
 * The layout a list's own width picks: a phone's list below 480px, the wide
 * tracks from 1200px, the narrow tracks between. The list's width, not the
 * window's: beside a ContextColumn at 1280px with the rail open it is 588px,
 * which is a laptop's list, not a phone's.
 */
export const PHONE_BELOW = 480;
export const WIDE_FROM = 1200;
export function listLayout(width: number): 'phone' | 'narrow' | 'wide' {
	return width === 0 ? 'narrow' : width < PHONE_BELOW ? 'phone' : width >= WIDE_FROM ? 'wide' : 'narrow';
}

export const CELL = 'min-w-0 truncate px-2';
export const END = 'pr-5 text-right';
/** The row's height rides the package's density ramp: 3.5rem, 3rem compact. */
export const ROW_HEIGHT = 'min-height: calc(var(--ds-control-height-md) + 1rem);';
/** The row text's size, between the body and the small print. */
export const ROW_TEXT = 'text-[0.8125rem]';
/** The hairline between two rows of one card. */
export const RULE = 'border-border/60 border-t';
/** The card that holds a group's rows. */
export const CARD = 'bg-card border-border overflow-hidden rounded-lg border';
/** The head card, and the ground behind it that hides the rows scrolling under it. */
export const HEAD_GROUND = 'bg-background sticky top-0 z-3 pb-3';
export const HEAD = 'bg-card border-border grid h-9 items-center rounded-lg border';
export const HEAD_TEXT = 'text-muted-foreground text-2xs tracking-eyebrow font-semibold uppercase';
/** A group's label line on the ground; the spacing is padding, so a measured height is the height it takes. */
export const GROUP = 'text-muted-foreground h-6.5 text-xs';
export const GROUP_LABEL = 'text-[0.8125rem] font-semibold';
export const groupSpacing = (index: number) => (index > 0 ? 'pt-4.5 pb-1.5' : 'pb-1.5');
/** The house focus ring, and the same ring drawn inside a control that fills a clipped card. */
export const RING = 'focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none';
export const RING_INSET =
	'focus-visible:inset-ring-ring/50 focus-visible:inset-ring-3 focus-visible:outline-none';
/**
 * A cell over an openable row lets a click through to the row beneath it, and
 * gives one back to any control a module's cell renders, so a link or a button
 * in a cell is never silently inert.
 */
export const THROUGH =
	'pointer-events-none [&_:is(a,button,input,select,textarea,label,summary,[role=button],[role=link],[role=checkbox],[tabindex])]:pointer-events-auto';
