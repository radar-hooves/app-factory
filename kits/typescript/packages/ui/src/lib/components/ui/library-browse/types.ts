import type { Status } from '../status/index.js';

/**
 * The shared library-data vocabulary — plain shapes a consuming app maps its
 * own API responses into. This package holds no HTTP client, no endpoint
 * string, and no knowledge of any backend or app; that is what lets the
 * backend be replaced without touching a consumer, and it is not negotiable
 * for convenience (#30). An app's own state vocabulary (whatever its wire
 * format says) is mapped by the app onto the shared five-state `Status`
 * before it arrives here, as a `LibraryBadge`.
 */

/** A consumer-mapped state chip: one of the five shared states plus the app's label. */
export interface LibraryBadge {
	status: Status;
	label: string;
}

/** One catalogue row. */
export interface LibraryDocument {
	id: string;
	title: string;
	/** Free labels on the document. */
	tags?: string[];
	/** Names of the collections it belongs to. */
	collections?: string[];
	/** Consumer-mapped state chips (e.g. one per collection's index state). */
	badges?: LibraryBadge[];
}

/** One choice inside a facet. */
export interface LibraryFacetOption {
	value: string;
	/** Documents carrying it; omit to render no count. */
	count?: number;
	/** Display label when the wire value is not presentable; defaults to `value`. */
	label?: string;
}

/** One facet dimension in the browse rail. The page owns the selection state. */
export interface LibraryFacet {
	/** Stable key handed back through `onFacetChange`. */
	key: string;
	label: string;
	options: LibraryFacetOption[];
	/** Currently selected wire values. */
	selected: string[];
	/** Allow several selections at once (default: a single toggle). */
	multiple?: boolean;
}

/** A label→value row in a document's field list. */
export interface LibraryField {
	label: string;
	value: string;
	/** Render the value in the code/data face (a hash, a path, a machine value). */
	mono?: boolean;
}

/** One recorded location of a document. */
export interface LibraryLocation {
	path: string;
	primary?: boolean;
	badge?: LibraryBadge;
}

/** One collection membership of a document. */
export interface LibraryMembership {
	id: string;
	name: string;
	badge?: LibraryBadge;
}

/** The full detail of one document. */
export interface LibraryDocumentDetail {
	id: string;
	title: string;
	fields?: LibraryField[];
	tags?: string[];
	locations?: LibraryLocation[];
	memberships?: LibraryMembership[];
}

/** The identity of one collection. */
export interface LibraryCollection {
	id: string;
	name: string;
	/** One already-formatted meta line (owner · pipeline · state). */
	subtitle?: string;
	description?: string;
	badge?: LibraryBadge;
}

/** A snippet segment; `highlight` marks the part that matched the query. */
export interface SearchSnippetSegment {
	text: string;
	highlight?: boolean;
}

/** One ranked search hit. */
export interface LibrarySearchResult {
	id: string;
	title: string;
	/** The matched passage: plain text, or segments carrying highlights. */
	snippet?: string | SearchSnippetSegment[];
	/** Relevance in [0, 1]; rendered as a percentage. */
	score?: number;
	/** Where the hit came from — a collection or corpus name. */
	source?: string;
	badges?: LibraryBadge[];
	/** One already-formatted trailing meta line (a date, a type). */
	meta?: string;
}
