/**
 * Where an answer came from.
 *
 * Two sources, one shape. The library emits a `citations` event after the
 * final assistant text, and that is the real one — it carries a document id,
 * so a chip can open the document. Until it ships everywhere, the same chips
 * are DERIVED from the "## Sources" block Milton already writes, which names
 * a title and a section but no id: those chips render and read, and cannot
 * open a pane. A derived citation is marked `derived` so the UI can tell.
 */

export interface Citation {
	n: number;
	document_id: string;
	title: string;
	section?: string;
	anchor?: string;
	snippet?: string;
	/** True when this came from the prose block rather than the wire event. */
	derived?: boolean;
}

/** Inline `[n]` markers, in order of first appearance.
 *
 * Deliberately not a global "[digits]" match: `[1](…)` is a markdown link and
 * `[1]: …` a link definition, and both appear in real answers. */
export function citationMarkers(markdown: string): number[] {
	const seen: number[] = [];
	for (const match of markdown.matchAll(/\[(\d{1,3})\](?![(:[])/g)) {
		const n = Number(match[1]);
		if (!seen.includes(n)) seen.push(n);
	}
	return seen;
}

const SOURCES_HEADING = /^[ \t]{0,3}#{1,6}[ \t]*sources[ \t]*:?[ \t]*$/im;

export interface SplitAnswer {
	/** The prose, with any trailing Sources block removed. */
	body: string;
	/** Citations read out of that block; empty when there was none. */
	citations: Citation[];
}

/**
 * Split a trailing "## Sources" block off an answer.
 *
 * The block is rendered by the Sources list instead, so leaving it in the
 * prose would print every source twice. A block that parses to nothing is left
 * where it was rather than silently deleted.
 */
export function splitSources(markdown: string): SplitAnswer {
	const heading = markdown.match(SOURCES_HEADING);
	if (!heading || heading.index === undefined) return { body: markdown, citations: [] };

	const block = markdown.slice(heading.index + heading[0].length);
	const citations = parseSourceLines(block);
	if (citations.length === 0) return { body: markdown, citations: [] };
	return { body: markdown.slice(0, heading.index).trimEnd(), citations };
}

/** One list item per source; anything else in the block is ignored. */
function parseSourceLines(block: string): Citation[] {
	const out: Citation[] = [];
	for (const raw of block.split('\n')) {
		const line = raw.trim();
		if (!line) continue;
		// A second heading ends the block — the Sources list is the tail of the
		// answer, not a section anything follows.
		if (/^#{1,6}\s/.test(line)) break;
		const item = line.match(/^(?:[-*+]|\[?(\d{1,3})\]?[.)])\s+(.*)$/);
		if (!item) continue;
		const numbered = item[1] ? Number(item[1]) : undefined;
		const parsed = parseSource(item[2]);
		if (!parsed.title) continue;
		out.push({
			n: numbered ?? out.length + 1,
			document_id: '',
			derived: true,
			...parsed
		});
	}
	return out;
}

/** `**Title** — Section`, `Title – Section`, `Title: Section`, or just a title. */
function parseSource(text: string): { title: string; section?: string } {
	const plain = text
		.replace(/\[(\d{1,3})\]\s*/, '')
		.replace(/\*\*/g, '')
		.replace(/[`*_]/g, '')
		.trim();
	const split = plain.match(/^(.+?)\s*(?:—|–|\s-\s|:)\s*(.+)$/);
	if (!split) return { title: plain };
	return { title: split[1].trim(), section: split[2].trim() };
}

/**
 * The citations a turn should render.
 *
 * The wire event wins outright whenever it arrived — it is the same list with
 * ids attached — so a turn never shows both.
 */
export function resolveCitations(fromEvent: Citation[], fromProse: Citation[]): Citation[] {
	return fromEvent.length > 0 ? fromEvent : fromProse;
}

/** One addressable slice of a document — the granularity a citation names. */
export interface DocumentSection {
	anchor: string;
	heading: string;
	text: string;
}

export interface LoadedDocument {
	title: string;
	sections: DocumentSection[];
}

/**
 * How the pane reads a document. The host supplies it, because the host is the
 * one holding the caller's session: the library's document read is
 * authenticated, and a package that fetched it directly would be reaching past
 * the app's own proxy with credentials it has no business holding.
 */
export type LoadDocument = (documentId: string) => Promise<LoadedDocument>;
