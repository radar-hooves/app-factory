/**
 * Every word this package puts in front of a reader, in one place.
 *
 * Here rather than inline in each component because these sentences are the
 * package's opinion about how Milton talks to a colleague, and an app that
 * needs a different register — a different name for the librarian, a room
 * whose boundary is worded by its own subject-matter owner — must be able to
 * change one string without forking a component.
 *
 * Every component takes `copy` as a PARTIAL and resolves it itself, so a host
 * overriding one line does not have to restate the other eleven, and a
 * component used directly behaves the same as one reached through
 * `Conversation`.
 */

export interface LibrarianCopy {
	/** Prefixes the date on a verified source: "verified 23 Jun 2026". */
	verified: string;
	/** A source the catalogue has never confirmed against its publisher. */
	notVerified: string;
	/** Shown under an answer that finished without citing anything. */
	notHeld: string;
	/** Shown when the run itself ended in error and said nothing about why. */
	answerFailed: string;
	/** Heading over the list of what an answer cited. */
	sources: string;
	/** Heading over the follow-up questions the librarian offered. */
	suggestions: string;
	/** The collapsed scope statement's own label. */
	scope: string;
	copyAnswer: string;
	copiedAnswer: string;
	askAgain: string;
	jumpToLatest: string;
	closeSource: string;
	documentUnavailable: string;
}

export const DEFAULT_COPY: LibrarianCopy = {
	verified: 'verified',
	notVerified: 'not verified',
	// Two sentences, both plain: what happened, and the likeliest reason. It
	// says nothing about collections, indexes or retrieval — a colleague
	// reading it has no model of any of those, and the room's own instruction
	// to Milton forbids him naming them either.
	notHeld: 'Milton answered this one without a source. He may not hold a document that covers it.',
	// A run can end `is_error` carrying no message at all, and a turn that
	// simply stops is the one thing a reader must not have to guess about.
	answerFailed: 'Milton stopped before he finished this one.',
	sources: 'Sources',
	suggestions: 'Ask next',
	scope: 'What Milton answers from',
	copyAnswer: 'Copy',
	copiedAnswer: 'Copied',
	askAgain: 'Ask again',
	jumpToLatest: 'Jump to latest',
	closeSource: 'Close source',
	documentUnavailable: "That document can't be opened right now."
};

/**
 * The package's words with a host's overrides on top.
 *
 * An explicitly `undefined` key is dropped rather than spread, because
 * `{...defaults, ...{ sources: undefined }}` leaves a component rendering
 * nothing at all — and that is exactly the shape a host produces by passing a
 * value it computed from state that has not loaded yet.
 */
export function resolveCopy(overrides?: Partial<LibrarianCopy>): LibrarianCopy {
	if (!overrides) return DEFAULT_COPY;
	const given = Object.fromEntries(
		Object.entries(overrides).filter(([, value]) => value !== undefined)
	);
	return { ...DEFAULT_COPY, ...given };
}
