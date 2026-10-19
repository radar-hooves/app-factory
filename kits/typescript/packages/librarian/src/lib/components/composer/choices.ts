/** A collection a person may read, as the app lists it: `name` is what a
 *  question is narrowed to, `title` is what the picker shows (the name,
 *  made readable, where there is none) and `description` is its one line
 *  under the title. A retrieval summary is never a field here: it is filing
 *  history. */
export interface CollectionChoice {
	name: string;
	title?: string;
	description?: string;
}

/** `defence-housing` as a reader would first read it: "Defence housing". */
export function titleOf(choice: CollectionChoice): string {
	const given = choice.title?.trim();
	if (given) return given;
	const words = choice.name.replace(/[-_]+/g, ' ').trim();
	return words ? words[0]!.toLocaleUpperCase() + words.slice(1) : choice.name;
}
