/**
 * Shared class constants for the hand-rolled raw <table> idiom — the escape
 * hatch for a small, static table that does not earn a full TanStack instance.
 * Centralised here so routes don't re-type the strings and so a change to the
 * header treatment reaches every app at once.
 *
 * For anything sortable, filterable or selectable, use DataTableTanstack
 * (`@poodle64/ui/data-table-tanstack`) instead.
 */

/** Header cell. */
export const TH_CLASS =
	'text-muted-foreground border-border border-b px-3 py-2 text-left text-2xs font-medium tracking-eyebrow uppercase';

/** Body cell. */
export const TD_CLASS = 'px-3 py-2.5';

/** Append to TH_CLASS for columns hidden below xl. */
export const TH_HIDDEN_UNTIL_XL = 'hidden xl:table-cell';
