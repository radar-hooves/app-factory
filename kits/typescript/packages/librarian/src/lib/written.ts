/**
 * The documents a persona writes while it answers.
 *
 * The app emits an `artefact` frame after each successful Write or Edit, and a
 * reopened conversation lists the same versions on its turns. The page shows
 * each version in the reading column and links it for download; the bytes
 * come from the host's own route, never from this package.
 */

import { fill, type ChatCopy } from './copy';
import type { Turn } from './transcript.svelte';

/** One version of one document, as the wire names it. */
export interface Written {
	/** A path relative to the conversation's folder; may contain "/". */
	name: string;
	/** Counts per name from 1 across the whole conversation. */
	version: number;
	/** `text/markdown` or `text/html`. */
	media_type: string;
	bytes?: number;
	/** What the app can render it as beyond the source (`docx`, `pdf`); empty
	 *  where it has no renderer. */
	formats: string[];
	/** What a reader calls it: "Minute: increased rent ceiling". */
	title: string;
	/** What sort of document it is ("minute"); null where nothing says. */
	kind: string | null;
	/** What this version changed since the one before it, in a phrase; null
	 *  for the first, or where nothing says. */
	changes: string | null;
	/** How many pages it runs to; 0 where the app cannot tell. */
	pages: number;
	/** When this page saw the version arrive, epoch ms. Absent for one read back. */
	at?: number;
}

/** The source of one version, to show it in the pane. */
export type LoadWritten = (
	name: string,
	version: number
) => Promise<{ text: string; mediaType: string }>;

/** Where one version downloads as `format` (`source` or one of its `formats`). */
export type WrittenUrl = (name: string, version: number, format: string) => string;

export const writtenKey = (written: Written): string => `${written.name}@${written.version}`;

export const isHtml = (mediaType: string): boolean => mediaType.toLowerCase().startsWith('text/html');

/** The newest version of each document in `written`, in the order they first appear. */
export function newestPerName(written: Written[]): Written[] {
	const newest = new Map<string, Written>();
	for (const w of written) {
		const had = newest.get(w.name);
		if (!had || w.version >= had.version) newest.set(w.name, w);
	}
	return [...newest.values()];
}

/** "Minute", or "Document" where the document has no kind. */
export function kindLabel(written: Written, words: ChatCopy): string {
	const kind = (written.kind ?? '').trim() || words.documentKind;
	return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** "Minute · 1 page · v1": kind, pages where known, version. */
export function writtenMeta(written: Written, words: ChatCopy): string {
	const parts = [kindLabel(written, words)];
	if (written.pages > 0)
		parts.push(written.pages === 1 ? words.pageCount : fill(words.pagesCount, { n: written.pages }));
	parts.push(fill(words.writtenVersion, { n: written.version }));
	return parts.join(' · ');
}

const baseName = (name: string): string => name.split('/').filter(Boolean).at(-1) ?? name;

/** The download a card's chip offers: Word where the app renders it, else the source as written. */
export function chipFor(
	written: Written,
	words: ChatCopy
): { format: string; file: string; label: string } {
	const file = baseName(written.name);
	if (written.formats.includes('docx')) {
		const stem = file.replace(/\.[^.]+$/, '');
		return { format: 'docx', file: `${stem}.docx`, label: words.formatWord };
	}
	return {
		format: 'source',
		file,
		label: isHtml(written.media_type) ? words.formatHtml : words.formatMarkdown
	};
}

/** A leading `---` front matter block is metadata, not the document. */
export function stripFrontMatter(text: string): string {
	return text.replace(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '').replace(/^\s*\n/, '');
}

/** Every version of `name` across the conversation, oldest first. */
export function writtenVersions(turns: Turn[], name: string): Written[] {
	const found = new Map<number, Written>();
	for (const turn of turns)
		for (const written of turn.written ?? [])
			if (written.name === name) found.set(written.version, written);
	return [...found.values()].sort((a, b) => a.version - b.version);
}

/** What a version downloads as: its source, then each format the app renders. */
export function downloads(
	written: Written,
	words: ChatCopy
): Array<{ format: string; label: string }> {
	const label = (format: string) =>
		format === 'docx' ? words.formatWord : format === 'pdf' ? words.formatPdf : format.toUpperCase();
	return [
		{ format: 'source', label: isHtml(written.media_type) ? words.formatHtml : words.formatMarkdown },
		...written.formats.map((format) => ({ format, label: label(format) }))
	];
}

/** An empty sandbox stops scripts, not fetches: a written page's <img> or CSS url() would be a beacon without this. */
export const FRAME_CSP =
	'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src data:">';

/**
 * A written HTML page as its sandboxed frame shows it: under `FRAME_CSP`, and
 * without a refresh, which navigates the frame itself, a fetch no policy stops.
 */
export function framed(html: string): string {
	const page = new DOMParser().parseFromString(html, 'text/html');
	for (const meta of page.querySelectorAll('meta[http-equiv]')) {
		if (meta.getAttribute('http-equiv')?.trim().toLowerCase() === 'refresh') meta.remove();
	}
	return FRAME_CSP + page.documentElement.outerHTML;
}
