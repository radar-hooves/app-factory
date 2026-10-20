/**
 * The documents a persona writes while it answers.
 *
 * The app emits an `artefact` frame after each successful Write or Edit, and a
 * reopened conversation lists the same versions on its turns. The page shows
 * each version in the reading column and links it for download; the bytes
 * come from the host's own route, never from this package.
 */

import type { ChatCopy } from './copy';
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
