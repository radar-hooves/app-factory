export interface FindFilter {
	key: string;
	label: string;
	/** Whether the filter is on. */
	active: boolean;
	/** How many rows it holds, shown beside the label. */
	count?: number;
}

export interface FindSaved {
	id: string;
	label: string;
}
