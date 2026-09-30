/**
 * The content measure: how wide the page body is allowed to get.
 *
 * A named scale rather than a width, because a width at the call site is the
 * problem this exists to solve. Surveyed at 2560px, one consumer had six
 * distinct caps across nine routes — `max-w-4xl` here, `max-w-[1600px]` there,
 * a `max-w-md` form somewhere else — each written by whoever built that page,
 * none of them wrong on its own, and no two agreeing. Between them they used
 * 15% to 79% of the width available. A scale with four names cannot drift like
 * that: it is one decision, taken once, in the layout.
 *
 * The tiers resolve through `--ds-shell-measure-*` custom properties (see
 * `styles.css`), so an app retunes any of them in one declaration.
 */

/**
 * - `prose` — a genuine reading measure (`72ch`) for long-form running text.
 * - `page` — everyday pages: forms, detail views, settings (`80rem`).
 * - `wide` — indexes, card grids, tables, dashboards (`120rem`).
 * - `full` — no cap. The default, so omitting `measure` changes nothing.
 *
 * The 80rem tier is `page` rather than `default` on purpose. The prop's default
 * is `full`, and a value literally named `default` that you do NOT get by
 * default is a trap a reader falls into once each. It is also not `standard`,
 * which this package already retired for being a name that says nothing.
 */
export type ShellMeasure = 'prose' | 'page' | 'wide' | 'full';

/** Every measure, narrowest first — the order the scale is documented in. */
export const SHELL_MEASURES = [
	'prose',
	'page',
	'wide',
	'full'
] as const satisfies readonly ShellMeasure[];
