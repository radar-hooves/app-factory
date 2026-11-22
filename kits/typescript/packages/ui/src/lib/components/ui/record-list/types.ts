import type { IconComponent } from '../app-shell/types.js';
import type { ListColumn } from '../ledger/types.js';
import type { Status } from '../status/index.js';

/** Something on file that wants the viewer: a chip on the row's second line. */
export interface RecordFlag {
	status: Status;
	label: string;
}

/** What the list reads off a row. A consumer extends it with its own fields for its columns. */
export interface RecordListRow {
	id: string | number;
	/** Line one: the record's name. */
	title: string;
	/** Line two, after any flags. */
	note?: string | null;
	/** A thumbnail before the title. Without one, `icon` or the list's `icon` stands in. */
	image?: string | null;
	/** The row's own tile, where each row is a kind of thing (a tool) rather than a photo. */
	icon?: IconComponent;
	/**
	 * What wants the viewer, first first. Line two shows the first as a chip
	 * and "+N more" naming the rest on hover; a phone's row shows every one.
	 */
	flags?: readonly RecordFlag[] | null;
}

/**
 * A column the module offers. The key `title` is the list's own cell (the
 * thumbnail, the title, the flags and the note): list it to rename or resize
 * it, or to draw it yourself with `cell`. It always shows, first. Every other
 * key is the module's, in its order.
 */
export interface RecordListColumn<R extends RecordListRow = RecordListRow> extends ListColumn<R> {
	/** The column's total over some rows: each group's on its label, all rows' in the total card. */
	total?: (rows: readonly R[]) => string;
}

/**
 * A group's heading where the group is a kind of thing: its label, and the
 * kind's mark before it. A group function returns one in place of a bare
 * label; groups still key by `label`.
 */
export interface RecordListGroup {
	label: string;
	/** The kind's mark, a household icon, its tone in the accent. */
	icon?: IconComponent;
	/** The mark in a status ink instead, where the kind means one (money in, money out). */
	tone?: Status;
}

/**
 * A way the viewer can group the list, offered in its Columns menu with None
 * after the last: the first letter, a status, every word that becomes the same
 * replacement.
 */
export interface RecordListGrouping<R extends RecordListRow = RecordListRow> {
	/** What the viewer's choice keeps. `none` is the list's own and never a grouping's. */
	key: string;
	/** Its name in the menu. */
	label: string;
	/** A row's group, by its label, or a heading with the kind's mark. */
	group: (row: R) => string | RecordListGroup;
	/**
	 * The groups' order: `rows`, the order their first rows come (the
	 * default); `label`, A to Z by label, numerals as numbers.
	 */
	order?: 'rows' | 'label';
	/** Under the menu's choice: what the grouping does. */
	hint?: string;
}

/** The viewer's own choices, which the consumer persists. */
export interface RecordListPreferences {
	/** The ticked columns' keys. */
	columns: string[];
	/** The chosen grouping's key, or `none`; only on a list that offers groupings. */
	group?: string;
}
