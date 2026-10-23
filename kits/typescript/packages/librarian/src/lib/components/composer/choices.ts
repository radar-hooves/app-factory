/** A set of collections the picker heads with one row, which asks across all
 *  of them. `name` is what a question is narrowed to; `title` is the heading. */
export interface CollectionGroup {
	name: string;
	title: string;
}

/** A collection a person may read, as the app lists it: `name` is what a
 *  question is narrowed to and `title` the full name (made readable from
 *  `name` where there is none), shown as the row's tooltip. `shortTitle` is
 *  the row's label when present. `group`, when any choice has one, files the
 *  choice under that group's heading. A retrieval summary is never a field
 *  here: it is filing history. */
export interface CollectionChoice {
	name: string;
	title?: string;
	shortTitle?: string;
	group?: CollectionGroup;
}

/** `defence-housing` as a reader would first read it: "Defence housing". */
export function titleOf(choice: CollectionChoice): string {
	const given = choice.title?.trim();
	if (given) return given;
	const words = choice.name.replace(/[-_]+/g, ' ').trim();
	return words ? words[0]!.toLocaleUpperCase() + words.slice(1) : choice.name;
}

/** What a row says: the short title where there is one, else the title. */
export function labelOf(choice: CollectionChoice): string {
	return choice.shortTitle?.trim() || titleOf(choice);
}
