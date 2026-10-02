import type { Snippet } from 'svelte';
import type { Status } from '../status/index.js';

/** How the viewer groups rows. `fy` honours the ledger's `fyStart`. */
export type LedgerPeriod = 'fy' | 'cy' | 'month' | 'week' | 'day' | 'none';

/** One statement line a synthetic row (a split, a join) was made from. */
export interface LedgerOrigin {
	/** ISO `YYYY-MM-DD`. */
	date: string;
	/** The line as the statement printed it. */
	description: string;
	/** Where it was printed: "Statement 23, line 14". */
	source?: string;
	amount: number | string;
}

/** What the ledger reads off a row. A consumer extends it with its own fields for its columns. */
export interface LedgerRow {
	id: string | number;
	/** ISO `YYYY-MM-DD`. */
	date: string;
	/** Line one: the counterparty the money moved with, the asset, the security. */
	title: string;
	/** Line two, under the title. */
	note?: string | null;
	/** Signed: money in is positive, money out negative. */
	amount: number | string;
	/** What the running balance counts after this row: money, a coin, units. */
	balance?: number | string | null;
	/** A chip beside the title, on line one. `true` is a warning. */
	review?: boolean | Status;
	/** The review chip's words, in the module's own voice. Defaults to "Review". */
	reviewLabel?: string;
	/**
	 * The amount is a conversion inside the account (dollars swapped for a
	 * coin, so what the account is worth does not change). It shows plain,
	 * neither income green nor the muted outgoing tone, and counts in no
	 * group's in, out or net, nor the ticked rows' net.
	 */
	conversion?: boolean;
	/** The attachment's name: a paperclip after the title, the name on hover. */
	attachment?: string | null;
	/** A row not as printed: the statement lines it was made from. */
	origins?: { summary?: string; lines: LedgerOrigin[] } | null;
}

/**
 * A column the module offers. The keys `date`, `title`, `amount` and `balance`
 * are the ledger's own cells: list one to rename or resize it (and, for
 * `balance`, to offer the running balance at all, with `text` saying what it
 * counts). Date, title and amount always show, first and in that order; the
 * balance is always last. Every other key is the module's, in its order.
 */
export interface LedgerColumn<R extends LedgerRow = LedgerRow> {
	key: string;
	/** Its name in the Columns menu, and its head unless `head` is shorter. */
	label: string;
	head?: string;
	/** A grid track, or one for a narrow ledger and one for a wide one. */
	width?: string | { narrow: string; wide: string };
	align?: 'start' | 'end';
	/** Ticked until the viewer chooses. Defaults to true, and to false for `balance`. */
	on?: boolean;
	/**
	 * What a click on the head sorts this column by: the real value, a number
	 * rather than its display text. Without it a column with `text` sorts by
	 * that text and a `cell`-only column does not sort. The running balance
	 * never sorts, since it depends on the order.
	 */
	sort?: (row: R) => number | string | null | undefined;
	/** A plain cell. */
	text?: (row: R) => string;
	/**
	 * A cell of the module's own markup. On a row that opens, a click passes
	 * through the cell to the row; a control inside takes `pointer-events-auto`.
	 */
	cell?: Snippet<[R]>;
}

/** The viewer's own choices, which the consumer persists. */
export interface LedgerPreferences {
	/** The ticked columns' keys, `balance` included. */
	columns: string[];
	period: LedgerPeriod;
}

/** What an opened row's content gets, to line its fields up under the columns. */
export interface LedgerOpenContext {
	close: () => void;
	/** The row's `grid-template-columns`, gutter first. */
	template: string;
	/** A column's grid line, 1-based with the gutter at 1; 0 when it is not shown. */
	column: (key: string) => number;
}
