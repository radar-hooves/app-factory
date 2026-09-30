/**
 * What a reader may hand Milton with a question.
 *
 * Session-scoped by design: these files are read for THIS conversation and
 * never filed into a shelf, so the limits here are about what a browser can
 * post and a model can read in one turn, not about a corpus.
 */

export const MAX_FILES = 10;
export const MAX_BYTES = 20 * 1024 * 1024;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const ACCEPTED_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'application/pdf',
	DOCX,
	'text/plain',
	'text/markdown'
] as const;

/** Browsers disagree about a `.md` file's type — Safari says `text/markdown`,
 *  Chrome on some platforms says `''` — so the extension is checked too, and
 *  the `accept` attribute lists both forms for the same reason. */
const ACCEPTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.pdf', '.docx', '.txt', '.md'];

export const ACCEPT_ATTRIBUTE = [...ACCEPTED_TYPES, ...ACCEPTED_EXTENSIONS].join(',');

export interface RejectedFile {
	name: string;
	reason: 'type' | 'size' | 'count';
}

export interface FileCheck {
	accepted: File[];
	rejected: RejectedFile[];
}

function typeAllowed(file: File): boolean {
	if ((ACCEPTED_TYPES as readonly string[]).includes(file.type)) return true;
	const name = file.name.toLowerCase();
	return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Merge a drop or a picker's selection into the files already attached.
 *
 * Returns the WHOLE new list rather than only the additions, because the count
 * limit is a property of the list and a caller that appended the return value
 * would silently exceed it.
 */
export function acceptFiles(existing: File[], incoming: File[] | FileList): FileCheck {
	const accepted = [...existing];
	const rejected: RejectedFile[] = [];

	for (const file of Array.from(incoming)) {
		if (!typeAllowed(file)) {
			rejected.push({ name: file.name, reason: 'type' });
			continue;
		}
		if (file.size > MAX_BYTES) {
			rejected.push({ name: file.name, reason: 'size' });
			continue;
		}
		if (accepted.length >= MAX_FILES) {
			rejected.push({ name: file.name, reason: 'count' });
			continue;
		}
		if (accepted.some((f) => f.name === file.name && f.size === file.size)) continue;
		accepted.push(file);
	}

	return { accepted, rejected };
}

/** One line a reader can act on, or empty when everything was taken. */
export function rejectionMessage(rejected: RejectedFile[]): string {
	if (rejected.length === 0) return '';
	const reasons: Record<RejectedFile['reason'], string> = {
		type: "isn't a file type Milton can read",
		size: 'is over 20 MB',
		count: `won't fit — ${MAX_FILES} files is the limit`
	};
	const [first] = rejected;
	const rest = rejected.length - 1;
	return `${first.name} ${reasons[first.reason]}${rest ? `, and ${rest} more` : ''}.`;
}

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${Math.round(kb)} KB`;
	return `${(kb / 1024).toFixed(kb / 1024 < 10 ? 1 : 0)} MB`;
}
