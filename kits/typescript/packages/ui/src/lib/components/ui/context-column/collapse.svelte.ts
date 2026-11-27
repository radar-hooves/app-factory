import { getContext, setContext } from 'svelte';

const KEY = Symbol('ds-column-sections');

/** Makes every titled Panel and StatList below collapsible, remembered under the column's name. */
export function provideColumnSections(name: () => string): void {
	setContext(KEY, name);
}

export interface ColumnSection {
	readonly collapsed: boolean;
	toggle: () => void;
}

/** A section's collapse state when it stands in a context column; null elsewhere. */
export function columnSection(title: () => string | undefined): ColumnSection | null {
	const name = getContext<(() => string) | undefined>(KEY);
	if (!name) return null;
	const key = () => `ds-column:${name()}:${title() ?? ''}`;
	const read = () => {
		try {
			return localStorage.getItem(key()) === '1';
		} catch {
			return false;
		}
	};
	let collapsed = $state(read());
	return {
		get collapsed() {
			return collapsed;
		},
		toggle() {
			collapsed = !collapsed;
			try {
				localStorage.setItem(key(), collapsed ? '1' : '0');
			} catch {
				// Private window: the fold holds for the page's life only.
			}
		}
	};
}
