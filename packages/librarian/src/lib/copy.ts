/**
 * Every word this package puts in front of a reader, in one place.
 *
 * Here rather than inline in each component because these sentences are the
 * package's opinion about how an agent talks to a colleague, and an app that
 * needs a different register — a room whose boundary is worded by its own
 * subject-matter owner — must be able to change one string without forking a
 * component.
 *
 * NO STRING HERE NAMES A PERSONA. The name is an argument: a consuming app
 * says who is speaking once, and every sentence the package renders is built
 * from that. Milton is the library's own persona and therefore the default,
 * which is a different thing from being baked in — a package that hardcodes
 * one app's persona is a package that lies in every other app, and did:
 * Pebblestone's Penny introduced herself as Milton for a fortnight.
 *
 * Every component takes `copy` as a PARTIAL and resolves it itself, so a host
 * overriding one line does not have to restate the others, and a component
 * used directly behaves the same as one reached through `Conversation`.
 */

/** The library's own persona: the default wherever a consumer names none. */
export const DEFAULT_PERSONA = 'Milton';

export interface LibrarianCopy {
	/** Prefixes the date on a verified source: "verified 23 Jun 2026". */
	verified: string;
	/** A source the catalogue has never confirmed against its publisher. */
	notVerified: string;
	/** Shown under an answer that finished without citing anything. */
	notHeld: string;
	/** Shown when the run itself ended in error and said nothing about why. */
	answerFailed: string;
	/** Shown when the stream never opened, or died mid-answer. */
	unreachable: string;
	/** Heading over the list of what an answer cited. */
	sources: string;
	/** Heading over the follow-up questions the persona offered. */
	suggestions: string;
	/** The collapsed scope statement's own label. */
	scope: string;
	/** The empty transcript's opening line. */
	welcome: string;
	/** The composer's placeholder, idle and while an answer streams. */
	askPlaceholder: string;
	answeringPlaceholder: string;
	/** The pre-first-token words, cycled one every 2.6s. */
	working: string[];
	/** The scroll region's accessible name. */
	conversationLabel: string;
	copyAnswer: string;
	copiedAnswer: string;
	askAgain: string;
	jumpToLatest: string;
	closeSource: string;
	documentUnavailable: string;
	/** An artefact card's action, and the same action while it is open. */
	openArtefact: string;
	showingArtefact: string;
	/** Beside the clock while the question waits behind someone else's. */
	waiting: string;
	/** Beside the clock on an answer this page did not start. */
	stillAnswering: string;
	/** The answer mark: the two verdicts, the optional note, and after. */
	markHelpful: string;
	markNotHelpful: string;
	markNote: string;
	markSend: string;
	markNoted: string;
	markFailed: string;
	/** The fair-use notice, while there are questions left and once there are
	 *  none, filled by `fill()`: `{resets}` is a time already, "midnight" or
	 *  "2:00 pm". */
	questionsLeft: string;
	limitReached: string;
	/** `{resets}` when the allowance comes back at the turn of the day. */
	midnight: string;
	support: string;
	/** The conversation list. */
	pastQuestions: string;
	newQuestion: string;
	readingPastQuestions: string;
	noPastQuestions: string;
	pastQuestionsFailed: string;
	conversationActions: string;
	rename: string;
	download: string;
	delete: string;
	save: string;
	cancel: string;
	deletePrompt: string;
	renameFailed: string;
	downloadFailed: string;
	deleteFailed: string;
}

/**
 * The display name for a persona a host identified by its slug.
 *
 * A route parameter is `penny`, and a colleague reading the screen is talking
 * to Penny. A host that already wrote the name the way it should read — any
 * capital at all — is left alone, so "McTavish" and "eight" both survive.
 */
export function personaName(name: string): string {
	const given = name.trim();
	if (!given) return DEFAULT_PERSONA;
	if (given !== given.toLowerCase()) return given;
	return given
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(' ');
}

/**
 * The package's words, spoken by one named persona.
 *
 * Deliberately free of pronouns: the persona is whoever the consuming app
 * says it is, and a sentence that guesses is wrong for half of them.
 */
export function copyFor(name: string = DEFAULT_PERSONA): LibrarianCopy {
	const who = personaName(name);
	return {
		verified: 'verified',
		notVerified: 'not verified',
		// Two sentences, both plain: what happened, and the likeliest reason. It
		// says nothing about collections, indexes or retrieval — a colleague
		// reading it has no model of any of those, and the room's own
		// instruction forbids naming them either.
		notHeld: `${who} answered this one without a source. There may be no document here that covers it.`,
		// A run can end `is_error` carrying no message at all, and a turn that
		// simply stops is the one thing a reader must not have to guess about.
		answerFailed: `${who} stopped before finishing this one.`,
		unreachable: `${who} can't be reached right now.`,
		sources: 'Sources',
		suggestions: 'Ask next',
		scope: `What ${who} answers from`,
		welcome: `Ask ${who} a question.`,
		askPlaceholder: `Ask ${who}…`,
		answeringPlaceholder: `${who} is answering…`,
		working: [`${who} is looking`, `${who} is reading`],
		conversationLabel: `Conversation with ${who}`,
		copyAnswer: 'Copy',
		copiedAnswer: 'Copied',
		askAgain: 'Ask again',
		jumpToLatest: 'Jump to latest',
		closeSource: 'Close source',
		documentUnavailable: "That document can't be opened right now.",
		openArtefact: 'Open',
		showingArtefact: 'Showing',
		waiting: `${who} is answering another question first`,
		stillAnswering: `${who} is still answering`,
		markHelpful: 'Helpful',
		markNotHelpful: 'Not helpful',
		markNote: 'Anything to add? (optional)',
		markSend: 'Send',
		markNoted: 'Thanks, noted.',
		markFailed: "That couldn't be sent. Nothing was recorded.",
		// The industry wording, whole: the number, that it is a fair-use limit
		// rather than a fault, and when it comes back. No apology.
		questionsLeft: '{remaining} of {limit} questions left today. Resets at {resets}.',
		limitReached: "You've reached today's fair-use limit of {limit} questions. It resets at {resets}.",
		midnight: 'midnight',
		support: 'Support',
		pastQuestions: 'Past questions',
		newQuestion: 'New question',
		readingPastQuestions: 'Reading your past questions…',
		noPastQuestions: 'No past questions yet.',
		pastQuestionsFailed: "Your past questions couldn't be read just now.",
		conversationActions: 'More',
		rename: 'Rename',
		download: 'Download',
		delete: 'Delete',
		save: 'Save',
		cancel: 'Cancel',
		deletePrompt: 'Delete this conversation? It goes from every device.',
		renameFailed: "That conversation couldn't be renamed.",
		downloadFailed: "That conversation couldn't be downloaded.",
		deleteFailed: "That conversation couldn't be deleted."
	};
}

/** A sentence with `{name}` places, filled. A place with no value stays as
 *  written, so a host's override that drops one loses nothing else. */
export function fill(template: string, values: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (place, key: string) =>
		key in values ? String(values[key]) : place
	);
}

/** The library's own words, for a host that names no persona. */
export const DEFAULT_COPY: LibrarianCopy = copyFor();

/**
 * One persona's words with a host's overrides on top.
 *
 * An explicitly `undefined` key is dropped rather than spread, because
 * `{...defaults, ...{ sources: undefined }}` leaves a component rendering
 * nothing at all — and that is exactly the shape a host produces by passing a
 * value it computed from state that has not loaded yet.
 */
export function resolveCopy(overrides?: Partial<LibrarianCopy>, name?: string): LibrarianCopy {
	const base = name === undefined ? DEFAULT_COPY : copyFor(name);
	if (!overrides) return base;
	const given = Object.fromEntries(
		Object.entries(overrides).filter(([, value]) => value !== undefined)
	);
	return { ...base, ...given };
}
