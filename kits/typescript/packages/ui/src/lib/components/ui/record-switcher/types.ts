/** A record another can be switched to. */
export interface RecordSwitcherItem {
	id: string | number;
	/** Its whole name, as the switcher shows it when it is the one open. */
	label: string;
	/** Under the name: where it is, what it is worth, when it was sold. */
	note?: string | null;
	href: string;
	/** Its thumbnail. Without one the switcher's `icon` stands in. */
	image?: string | null;
}

/** A run of records under a heading: owned, then sold. */
export interface RecordSwitcherGroup {
	label?: string;
	items: readonly RecordSwitcherItem[];
}

/** One of the open record's own pages, a tab beside its name. */
export interface RecordPage {
	label: string;
	href: string;
	current?: boolean;
}
