/**
 * Every word this package puts in front of a reader, in one place.
 *
 * Here rather than inline in each component because these sentences are the
 * package's opinion about how an agent talks to a colleague, and an app that
 * needs a different register — a persona whose boundary is worded by its own
 * subject-matter owner — must be able to change one string without forking a
 * component.
 *
 * NO STRING HERE NAMES A PERSONA. The name is an argument: a consuming app
 * says who is speaking once, and every sentence the package renders is built
 * from that. The default is a neutral name, never one app's persona: a
 * package that hardcodes one app's persona is a package that lies in every
 * other app.
 *
 * Every component takes `copy` as a PARTIAL and resolves it itself, so a host
 * overriding one line does not have to restate the others, and a component
 * used directly behaves the same as one reached through `Conversation`.
 */

/** The name used wherever a consumer names no persona. */
export const DEFAULT_PERSONA = 'Assistant';

export interface ChatCopy {
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
	/** Shown on a question stopped before a word of its answer came. */
	noAnswer: string;
	/** Heading over the list of what an answer cited. */
	sources: string;
	/** The collapsed scope statement's own label. */
	scope: string;
	/** The empty transcript's opening line. */
	welcome: string;
	/** The composer's placeholder, idle and while an answer streams. */
	askPlaceholder: string;
	answeringPlaceholder: string;
	/** The composer's collection picker: its group's accessible name, and the
	 *  choice that asks across everything the person may read. A collection is
	 *  shown by its own title, supplied by the app. */
	collectionsLabel: string;
	allCollections: string;
	/** The picker's search field, from a long list up, and what it says
	 *  when nothing matches. */
	findCollection: string;
	noCollectionMatch: string;
	/** The picker's two steps: the subjects' list, a subject taken whole
	 *  (`{subject}`), a subject's row read aloud (`{subject}`, `{count}`), a
	 *  collection found by search read with its subject (`{collection}`,
	 *  `{subject}`), and the sheet's way back from a subject (`{subject}`). */
	subjectsLabel: string;
	allOfSubject: string;
	subjectRow: string;
	inSubject: string;
	backToSubjects: string;
	/** Past a few turns, the quiet line above the composer that offers to
	 *  start over — a follow-up re-reads the whole conversation, so each one
	 *  costs more than the last. */
	longConversation: string;
	/** The working line's words when nothing more is known of what is happening. */
	working: string;
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
	/** Beside the clock on an answer this page did not start. */
	stillAnswering: string;
	/** The working line's control that stops the answer. */
	stop: string;
	/** An expanded tool step: what went in, what came back, and a call that failed. */
	stepInput: string;
	stepResult: string;
	stepFailed: string;
	/** Editing a question already asked: the control, the send, and what the
	 *  edit does not carry. */
	editQuestion: string;
	editSend: string;
	editFilesNote: string;
	/** The fold over a turn's steps: its sentence is composed from the steps,
	 *  each phrase lower-case and joined by `stepsAnd` ("Read your attachment,
	 *  searched the library and the web, and wrote a minute"). `{kind}` is the
	 *  document's own kind, or `documentKind`. */
	stepsRead: string;
	stepsSearchedLibrary: string;
	stepsSearchedWeb: string;
	stepsSearchedBoth: string;
	stepsOpened: string;
	stepsWrote: string;
	stepsEdited: string;
	stepsThought: string;
	stepsOther: string;
	stepsAnd: string;
	/** What is happening now, while the turn runs. */
	nowRead: string;
	nowLibrary: string;
	nowWeb: string;
	nowOpen: string;
	nowWrite: string;
	nowEdit: string;
	nowThought: string;
	nowOther: string;
	/** Before the persona's first word: starting, and reading the passages the
	 *  app retrieved for the question (`{n}`). */
	nowStarting: string;
	nowPassages: string;
	nowPassage: string;
	/** The answer itself being written. */
	nowAnswer: string;
	stepCount: string;
	stepCountOne: string;
	/** The right-hand count of a step's row: what a library search found. */
	stepFound: string;
	stepFoundOne: string;
	stepPagesRead: string;
	stepPageRead: string;
	/** A thinking row: while it streams, once done, and with its duration. */
	thinking: string;
	thought: string;
	thoughtFor: string;
	/** The kind of a document that names none. */
	documentKind: string;
	pagesCount: string;
	pageCount: string;
	/** The pane: when a version was written, what changed, and copying it. */
	paneWritten: string;
	paneEdited: string;
	justNow: string;
	changedSince: string;
	copyDocument: string;
	copiedDocument: string;
	/** The sources fold: its summary and its two groups. */
	sourcesCount: string;
	sourcesCountOne: string;
	sourcesLibrary: string;
	sourcesWeb: string;
	fromTheLibrary: string;
	readToday: string;
	readOn: string;
	/** A fenced block still being written. */
	drawing: string;
	/** Web pages an answer drew on, listed apart from its numbered sources. */
	fromTheWeb: string;
	/** A document the persona wrote: its version (`{n}`), the version switcher's
	 *  name, and what each download is called. */
	writtenVersion: string;
	writtenVersions: string;
	formatMarkdown: string;
	formatHtml: string;
	formatWord: string;
	formatPdf: string;
	/** The answer mark: the two verdicts, the optional note, and after. */
	markHelpful: string;
	markNotHelpful: string;
	markNote: string;
	markSend: string;
	markNoted: string;
	markFailed: string;
	/** Sharing an answer: the action, once shared, who can open it, and a
	 *  share or a stop that did not go through. */
	share: string;
	copyLink: string;
	linkCopied: string;
	stopSharing: string;
	sharedWith: string;
	shareFailed: string;
	/** The fair-use notice, while there are questions left and once there are
	 *  none, filled by `fill()`: `{resets}` is a time already, "midnight" or
	 *  "2:00 pm". */
	questionsLeft: string;
	limitReached: string;
	/** `{resets}` when the allowance comes back at the turn of the day. */
	midnight: string;
	support: string;
	/** The conversation list, and closing it where the host lays it over the page. */
	pastQuestions: string;
	newQuestion: string;
	closePastQuestions: string;
	/** A column of past questions folded to its edge, and opened again. */
	hidePastQuestions: string;
	showPastQuestions: string;
	/** The list's groups, by when each conversation was last active. */
	today: string;
	yesterday: string;
	earlier: string;
	/** Clearing every past question: the control, its confirmation, and a clear that did not go through. */
	clearAll: string;
	clearAllPrompt: string;
	clearAllDetail: string;
	clearAllFailed: string;
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
export function copyFor(name: string = DEFAULT_PERSONA): ChatCopy {
	const who = personaName(name);
	return {
		verified: 'verified',
		notVerified: 'not verified',
		// Two sentences, both plain: what happened, and the likeliest reason. It
		// says nothing about collections, indexes or retrieval — a colleague
		// reading it has no model of any of those, and the persona's own
		// instruction forbids naming them either.
		notHeld: `${who} answered this one without a source. There may be no document here that covers it.`,
		// A run can end `is_error` carrying no message at all, and a turn that
		// simply stops is the one thing a reader must not have to guess about.
		answerFailed: `${who} stopped before finishing this one.`,
		unreachable: `${who} can't be reached right now.`,
		noAnswer: 'Stopped before an answer came.',
		sources: 'Sources',
		scope: `What ${who} answers from`,
		welcome: `Ask ${who} a question.`,
		askPlaceholder: `Ask ${who}…`,
		answeringPlaceholder: `${who} is answering…`,
		collectionsLabel: `Where ${who} looks`,
		allCollections: 'All your collections',
		findCollection: 'Search',
		noCollectionMatch: 'Nothing matches that.',
		subjectsLabel: 'Subjects',
		allOfSubject: 'All of {subject}',
		subjectRow: '{subject}, {count} to choose from',
		inSubject: '{collection}, in {subject}',
		backToSubjects: 'Back to subjects from {subject}',
		longConversation: `This conversation is getting long. A new question keeps ${who} quick.`,
		working: `${who} is working`,
		conversationLabel: `Conversation with ${who}`,
		copyAnswer: 'Copy',
		copiedAnswer: 'Copied',
		askAgain: 'Ask again',
		jumpToLatest: 'Jump to latest',
		closeSource: 'Close source',
		documentUnavailable: "That document can't be opened right now.",
		openArtefact: 'Open',
		showingArtefact: 'Showing',
		stillAnswering: `${who} is still answering`,
		stop: 'Stop',
		stepInput: 'Input',
		stepResult: 'Result',
		stepFailed: 'Failed',
		editQuestion: 'Edit',
		editSend: 'Send',
		editFilesNote: 'Files attached to the original question are not sent again.',
		stepsRead: 'read your attachment',
		stepsSearchedLibrary: 'searched the library',
		stepsSearchedWeb: 'searched the web',
		stepsSearchedBoth: 'searched the library and the web',
		stepsOpened: 'opened a document',
		stepsWrote: 'wrote a {kind}',
		stepsEdited: 'edited the {kind}',
		stepsThought: 'thought',
		stepsOther: 'looked into it',
		stepsAnd: 'and',
		nowRead: 'Reading your attachment…',
		nowLibrary: 'Searching the library…',
		nowWeb: 'Searching the web…',
		nowOpen: 'Opening a document…',
		nowWrite: 'Writing a {kind}…',
		nowEdit: 'Editing the {kind}…',
		nowThought: 'Thinking…',
		nowOther: 'Working on it…',
		nowStarting: 'Starting…',
		nowPassages: 'Reading {n} passages…',
		nowPassage: 'Reading 1 passage…',
		nowAnswer: 'Writing the answer…',
		stepCount: '{n} steps',
		stepCountOne: '1 step',
		stepFound: '{n} passages',
		stepFoundOne: '1 passage',
		stepPagesRead: '{n} pages read',
		stepPageRead: '1 page read',
		thinking: 'Thinking…',
		thought: 'Thought',
		thoughtFor: 'Thought for {n}s',
		documentKind: 'document',
		pagesCount: '{n} pages',
		pageCount: '1 page',
		paneWritten: 'written {when}',
		paneEdited: 'edited {when}',
		justNow: 'just now',
		changedSince: 'Changed since v{n}: {changes}',
		copyDocument: 'Copy',
		copiedDocument: 'Copied',
		sourcesCount: '{n} sources',
		sourcesCountOne: '1 source',
		sourcesLibrary: '{n} library',
		sourcesWeb: '{n} web',
		fromTheLibrary: 'From the library',
		readToday: 'read today',
		readOn: 'read {date}',
		drawing: 'Drawing…',
		fromTheWeb: 'From the web',
		writtenVersion: 'v{n}',
		writtenVersions: 'Version',
		formatMarkdown: 'Markdown',
		formatHtml: 'HTML',
		formatWord: 'Word',
		formatPdf: 'PDF',
		markHelpful: 'Helpful',
		markNotHelpful: 'Not helpful',
		markNote: 'Anything to add? (optional)',
		markSend: 'Send',
		markNoted: 'Thanks, noted.',
		markFailed: "That couldn't be sent. Nothing was recorded.",
		share: 'Share',
		copyLink: 'Copy link',
		linkCopied: 'Link copied',
		stopSharing: 'Stop sharing',
		sharedWith: `Shared: anyone who can ask ${who} here can open the link.`,
		shareFailed: "That didn't go through. Try again.",
		// The industry wording, whole: the number, that it is a fair-use limit
		// rather than a fault, and when it comes back. No apology.
		questionsLeft: '{remaining} of {limit} questions left today. Resets at {resets}.',
		limitReached: "You've reached today's fair-use limit of {limit} questions. It resets at {resets}.",
		midnight: 'midnight',
		support: 'Support',
		pastQuestions: 'Past questions',
		newQuestion: 'New question',
		closePastQuestions: 'Close past questions',
		hidePastQuestions: 'Hide past questions',
		showPastQuestions: 'Show past questions',
		today: 'Today',
		yesterday: 'Yesterday',
		earlier: 'Earlier',
		clearAll: 'Clear all',
		clearAllPrompt: 'Clear all your past questions?',
		clearAllDetail: `Every conversation with ${who} goes, from every device, except one still being answered. This cannot be undone.`,
		clearAllFailed: "Your past questions couldn't be cleared.",
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

/** The package's own words, for a host that names no persona. */
export const DEFAULT_COPY: ChatCopy = copyFor();

/**
 * One persona's words with a host's overrides on top.
 *
 * An explicitly `undefined` key is dropped rather than spread, because
 * `{...defaults, ...{ sources: undefined }}` leaves a component rendering
 * nothing at all — and that is exactly the shape a host produces by passing a
 * value it computed from state that has not loaded yet.
 */
export function resolveCopy(overrides?: Partial<ChatCopy>, name?: string): ChatCopy {
	const base = name === undefined ? DEFAULT_COPY : copyFor(name);
	if (!overrides) return base;
	const given = Object.fromEntries(
		Object.entries(overrides).filter(([, value]) => value !== undefined)
	);
	return { ...base, ...given };
}
