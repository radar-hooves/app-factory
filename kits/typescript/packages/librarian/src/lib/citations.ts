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

import type { LibrarianCopy } from './copy';

export interface Citation {
	n: number;
	document_id: string;
	title: string;
	section?: string;
	anchor?: string;
	snippet?: string;
	/**
	 * The date the last recheck found this document unchanged at its
	 * publisher, `YYYY-MM-DD`. Null when nothing has ever confirmed it.
	 *
	 * The library resolves this from its own catalogue, never from what the
	 * model wrote — a trust mark a model can author is not a trust mark — so
	 * a DERIVED citation carries none at all, and absent is not the same fact
	 * as null.
	 */
	verified_at?: string | null;
	/** True when read off the stream — the prose's Sources block, or a call
	 *  that read it — rather than the library's own frame. Nothing checked it,
	 *  so it carries no trust mark. */
	derived?: boolean;
}

/** Inline `[n]` markers, in order of first appearance.
 *
 * Deliberately not a global "[digits]" match: `[1](…)` is a markdown link and
 * `[1]: …` a link definition, and both appear in real answers.
 *
 * A following `[` is NOT excluded, and that is the point: `[1][2]` is how an
 * answer cites two sources for one claim, and a lookahead that rejected it
 * dropped the FIRST of the pair — `matchAll` resumes after the failed attempt
 * rather than backtracking, so `[1]` was never seen at all and rendered as
 * dead text beside a live `[2]`. */
export function citationMarkers(markdown: string): number[] {
	const seen: number[] = [];
	for (const match of markdown.matchAll(/\[(\d{1,3})\](?![(:])/g)) {
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

	// The block runs to the NEXT heading, not to the end of the answer. Cutting
	// to the end loses anything Milton wrote after his sources — a closing note,
	// a caveat — and loses it silently, which is the worst way to lose it.
	const after = markdown.slice(heading.index + heading[0].length);
	const next = after.search(/^[ \t]{0,3}#{1,6}[ \t]/m);
	const block = next === -1 ? after : after.slice(0, next);
	const tail = next === -1 ? '' : after.slice(next).trim();

	const citations = parseSourceLines(block);
	if (citations.length === 0) return { body: markdown, citations: [] };

	const before = markdown.slice(0, heading.index).trimEnd();
	return { body: tail ? `${before}\n\n${tail}` : before, citations };
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `2026-06-23` as `23 Jun 2026`, or null if it is not a date.
 *
 * Read off the string rather than through `new Date()`: a date-only string is
 * parsed as UTC midnight and then RENDERED in the reader's own zone, so every
 * reader west of Greenwich would be shown the day before the one the library
 * recorded. There is no time here to convert — a date is what was stored.
 *
 * `Intl` is not used either: `en-AU` abbreviates June as "June", so the mark
 * would change length month to month for no reason a reader benefits from.
 */
export function formatVerified(iso: string): string | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
	if (!match) return null;
	const [, year, month, day] = match;
	const index = Number(month) - 1;
	const date = Number(day);
	// Round-tripped rather than bounds-checked: 1-31 admits "31 Apr 2026",
	// and a mark that shows a day that never happened is worse than no mark.
	const made = new Date(Date.UTC(Number(year), index, date));
	if (made.getUTCMonth() !== index || made.getUTCDate() !== date) return null;
	return `${date} ${MONTHS[index]} ${year}`;
}

/**
 * How current this source is, in words a reader already has.
 *
 * Three outcomes, and the third is the one worth stating: a citation the
 * package DERIVED from a "## Sources" block gets no mark at all. It has no
 * catalogued document behind it, so "not verified" would be a claim about a
 * record we never read — and a wrong trust mark is worse than none.
 *
 * A `verified_at` that is present but not a date is treated as no date, for
 * the same reason: what is shown must be what is known.
 */
export function trustMark(citation: Citation, copy: LibrarianCopy): string | null {
	if (citation.derived) return null;
	const when = citation.verified_at ? formatVerified(citation.verified_at) : null;
	return when ? `${copy.verified} ${when}` : copy.notVerified;
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
