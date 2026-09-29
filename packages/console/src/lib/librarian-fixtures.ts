/**
 * Every state the librarian surface can be in, as data.
 *
 * Fixtures rather than a live stream on purpose: a screenshot grid across
 * three widths and two themes has to render the SAME answer every time, and a
 * real model does not. What is faked here is the stream; everything the
 * components then do with it — folding, measuring, citing — is the shipped
 * code (`rules-library/core/verification.md` §Scripts Drive, Models Judge).
 */

/// <reference types="vite/client" />
import type { Artefact, Block, DescribeTool, Turn } from '@poodle64/librarian/transcript';
import type { Citation, LoadedDocument } from '@poodle64/librarian/citations';
import type { AgentEvent } from '@poodle64/librarian/client';
import type { LibrarianCopy } from '@poodle64/librarian/copy';
import { Session } from '@poodle64/librarian/session';
// The package's own fixture, captured from the real CLI — see its
// `captured.ts` for how, and what was sanitised.
import jobStream from '../../../librarian/src/test/fixtures/job-stream.jsonl?raw';

/** cadmus prepends this to every question before it reaches the library, and
 *  the transcript must never show it. */
const PREAMBLE =
	'You are Milton, the librarian for the ADF Pay and Conditions room. Answer a ' +
	"Defence colleague's question about pay, allowances, leave and conditions of " +
	'service, citing the document and its chapter or part in plain words.';

export const EXAMPLES = [
	'How much recreation leave do I get each year?',
	'What is the rate for the field allowance?',
	'Can I carry leave over when I post?'
];

const text = (index: number, body: string): Block => ({ kind: 'text', index, text: body });

const tool = (index: number, name: string, input: Record<string, unknown>): Block => ({
	kind: 'tool',
	index,
	name,
	rawInput: JSON.stringify(input),
	result: 'Recreation leave accrues at 20 days a year for permanent members.'
});

const SHORT = `Recreation leave accrues at **20 days a year** for a permanent member of the
ADF [1], credited monthly in arrears rather than in a single annual grant.

A member on a period of leave without pay does not accrue it for that period [2].`;

const LONG = `Recreation leave accrues at **20 days a year** for a permanent member of the
ADF [1], credited monthly in arrears rather than as a single annual grant. Reserve
members on continuous full-time service accrue at the same rate for the period of
that service.

## What accrues, and when

| Service category | Days a year | Accrual | Carry-over cap |
| --- | --- | --- | --- |
| Permanent | 20 | Monthly in arrears | 60 days |
| Reserve on CFTS | 20 (pro rata) | Monthly in arrears | 60 days |
| Reserve, other service | Nil | — | — |
| Leave without pay | Nil for the period | Suspended | Unchanged |

Leave is credited on the first day of the month following the month it was
earned, so a member who joins mid-month sees their first credit at the start of
the month after next [2].

## Carrying leave over

A balance above the cap is not lost automatically. The delegate may approve
carriage where operational requirements prevented the leave being taken, and
that approval is recorded against the member's file [3].

> A member should not be disadvantaged where service requirements, and not their
> own choice, prevented leave being taken.

Where a member posts mid-year the balance follows them; there is no acquittal at
the posting.

### Checking a balance

\`\`\`bash
# The self-service view, from any Defence terminal
pmkeys leave --category recreation --member self
\`\`\`

If the figure there disagrees with a pay slip, the pay slip is the record of
what was credited and the self-service view is a projection.

## Sources

1. **PACMAN Division 2** — Part 5, recreation leave
2. **PACMAN Division 2** — Part 5.2, accrual and crediting
3. **PACMAN Division 1** — Part 1, delegate approvals`;

/** Both trust marks in one answer, deliberately: a source last confirmed on a
 *  date, and one nothing has ever confirmed. A grid where every source is
 *  verified proves only half the rendering. */
export const CITATIONS: Citation[] = [
	{
		n: 1,
		document_id: 'pacman-division-2',
		title: 'PACMAN Division 2',
		section: 'Part 5 — Recreation leave',
		anchor: 'part-5',
		snippet: 'A permanent member accrues 20 days of recreation leave a year.',
		verified_at: '2026-06-23'
	},
	{
		n: 2,
		document_id: 'pacman-division-2',
		title: 'PACMAN Division 2',
		section: 'Part 5.2 — Accrual and crediting',
		anchor: 'part-5-2',
		snippet: 'Leave is credited monthly in arrears.',
		verified_at: '2026-06-23'
	},
	{
		n: 3,
		document_id: 'pacman-division-1',
		title: 'PACMAN Division 1',
		section: 'Part 1 — Delegate approvals',
		anchor: 'part-1',
		snippet: 'The delegate may approve carriage of a balance above the cap.',
		verified_at: null
	}
];

/** What the librarian offers to be asked next, at the length it really sends
 *  them — long enough to wrap a chip at 390. */
export const SUGGESTIONS = [
	'Can I carry leave over when I post?',
	'What happens to my balance on leave without pay?',
	'How is long service leave different?'
];

/** The room's own boundary, as a host writes it: what he answers from, then
 *  what he does not hold. */
export const SCOPE =
	'Milton answers from the ADF Pay and Conditions Manual (PACMAN) — pay, leave, allowances ' +
	'and conditions of service, as the instruments themselves set them out.\n\n' +
	'He does not hold your own pay records, your posting order, your unit’s orders, or anything ' +
	'about your individual case. For those, your orderly room is the place to go.';

const DOCUMENTS: Record<string, LoadedDocument> = {
	'pacman-division-2': {
		title: 'PACMAN Division 2 — Leave',
		sections: [
			{
				anchor: 'part-1',
				heading: 'Part 1 — Application',
				text: 'This Division applies to a permanent member of the ADF and to a Reserve member on continuous full-time service.'
			},
			{
				anchor: 'part-5',
				heading: 'Part 5 — Recreation leave',
				text: 'A permanent member accrues **20 days** of recreation leave a year. A Reserve member on continuous full-time service accrues at the same rate for the period of that service, calculated pro rata.'
			},
			{
				anchor: 'part-5-2',
				heading: 'Part 5.2 — Accrual and crediting',
				text: 'Leave is credited monthly in arrears, on the first day of the month following the month in which it was earned. A member on leave without pay does not accrue recreation leave for that period.'
			},
			{
				anchor: 'part-6',
				heading: 'Part 6 — Long service leave',
				text: 'Long service leave is dealt with separately and is not affected by a recreation leave balance.'
			}
		]
	},
	'pacman-division-1': {
		title: 'PACMAN Division 1 — Administration',
		sections: [
			{
				anchor: 'part-1',
				heading: 'Part 1 — Delegate approvals',
				text: 'The delegate may approve carriage of a recreation leave balance above the cap where operational requirements prevented the leave being taken. The approval is recorded against the member’s file.'
			},
			{
				anchor: 'part-2',
				heading: 'Part 2 — Records',
				text: 'A record of an approval under Part 1 is retained for seven years.'
			}
		]
	}
};

export async function loadDocument(documentId: string): Promise<LoadedDocument> {
	const found = DOCUMENTS[documentId];
	if (!found) throw new Error(`no such document: ${documentId}`);
	return found;
}

const question = (asked: string) => `${PREAMBLE}\n\n${asked}`;

function splitAt(markdown: string, heading: string): [string, string] {
	const at = markdown.indexOf(heading);
	return [markdown.slice(0, at).trimEnd(), markdown.slice(at)];
}

const UNCITED = `Leave is administered under the one manual across the ADF, and a unit does not
set its own accrual or its own carry-over cap. How a particular unit *schedules* leave — a
stand-down period, a roster, who to ask first — is a local matter, decided at the unit rather
than in an instrument.`;

const ACTIVITY: Block[] = [
	tool(0, 'Grep', { pattern: 'recreation leave' }),
	tool(1, 'Read', { file_path: '/data/staged/pacman-division-2/page-014.md' }),
	tool(2, 'Read', { file_path: '/data/staged/pacman-division-2/page-015.md' })
];

/** What Milton says BETWEEN two tool calls, verbatim off production
 *  (11/09/2026). It reaches the caller as a plain `text` block — the stream
 *  carries no `thinking` blocks at all — so until `segment()` learned to read
 *  its POSITION this rendered unfolded, as the first line of the answer. */
const NARRATION =
	"Let me also check if there's any provision for cashing out while still serving, to be thorough.";

export type LabState =
	| 'empty'
	| 'working'
	| 'streaming'
	| 'answer'
	| 'citations'
	| 'sources'
	| 'attachments'
	| 'narration'
	| 'error'
	| 'stopped'
	| 'not-held'
	| 'chat'
	| 'persona'
	| 'job'
	| 'job-showing'
	| 'job-live';

export interface LabScene {
	turns: Turn[];
	running: boolean;
	value: string;
	files: File[];
	/** Who is answering. Every scene but `persona` is the library's own Milton,
	 *  which is what keeps the default honest: one scene renames the persona
	 *  and the whole surface follows, including the words. */
	name: string;
	/** A session the app started rather than a question the reader asked:
	 *  the host's tool words, artefact, page viewer and composer note. */
	job?: boolean;
	/** The turn whose artefact the host's column is showing. */
	showing?: string;
}

/**
 * A session the app started: a receipt, read as a job with nobody asking —
 * the prompt, a second message while the session was open, and a third run
 * resumed after it finished. The stream is the real CLI's; what the host adds
 * on top is below, in the host's own words.
 */
const JOB: AgentEvent[] = jobStream
	.trim()
	.split('\n')
	.map((line) => JSON.parse(line) as AgentEvent);

/** The host's words for its persona's tools: page slices read, a sum checked. */
export const JOB_WORDS: DescribeTool = (block) => {
	let input: Record<string, unknown> = {};
	try {
		input = JSON.parse(block.rawInput) as Record<string, unknown>;
	} catch {
		/* mid-stream input is partial */
	}
	const slice = /page-(\d+)-(\d+)\.png$/.exec(String(input.file_path ?? ''));
	if (block.name === 'Read' && slice) {
		const part = slice[2] === '1' ? 'top slice' : 'bottom slice';
		return {
			verb: 'Read',
			object: `page ${slice[1]}, ${part}`,
			tally: ['slice read', 'slices read'],
			source: { id: `page-${slice[1]}-${slice[2]}`, title: `Page ${slice[1]}`, section: part }
		};
	}
	if (block.name === 'Bash') {
		return {
			verb: 'Added up',
			object: 'the line amounts',
			detail: block.result?.split('\n').join(' · '),
			tally: ['sum checked', 'sums checked']
		};
	}
	return undefined;
};

export const JOB_COPY: Partial<LibrarianCopy> = {
	sources: 'Read from',
	notHeld: '',
	askAgain: 'Run again',
	askPlaceholder: 'Tell the clerk something, or ask why it read a line as it did…'
};

export const JOB_NOTE = 'It carries on from where it stopped.';

/** What the first run handed in, carded under its answer. */
export const JOB_READING: Artefact = {
	title: 'What it read',
	summary: '6 lines and 3 details · adds up to $42.38'
};

function job(events: AgentEvent[]): Turn[] {
	const session = new Session();
	for (const event of events) session.apply(event);
	return session.turns.map((turn, index) =>
		index === 0 && turn.outcome ? { ...turn, artefact: JOB_READING } : turn
	);
}

/** A second persona's answer, in a second app's subject matter: the package
 *  is a shape, and nothing in it is about a library. */
const PENNY = `Four bills are waiting on you, worth **$18,420** in total. Two are inside their
payment terms this week; the other two are the concrete supplier's, held since
Friday pending a delivery docket.`;

/** Fixed clock times, so the grid photographs the same transcript every run. */
const CLOCK = Date.UTC(2026, 8, 16, 0, 12);
const minutes = (n: number) => CLOCK + n * 60_000;

function fakeFile(name: string, type: string, size: number): File {
	const made = new File([''], name, { type });
	Object.defineProperty(made, 'size', { value: size });
	return made;
}

export function scene(state: LabState): LabScene {
	const base: LabScene = { turns: [], running: false, value: '', files: [], name: 'Milton' };

	if (state === 'empty') return base;

	// A session somebody else started, whole: three runs, the reading carded
	// under the first answer, and what it read listed under that.
	if (state === 'job' || state === 'job-showing') {
		const turns = job(JOB);
		return {
			...base,
			name: 'clerk',
			job: true,
			turns,
			showing: state === 'job-showing' ? turns[0].id : undefined
		};
	}

	// The same session caught mid-run: the sum is still being checked.
	if (state === 'job-live') {
		const firstResult = JOB.findIndex((event) => event.type === 'result');
		const lastCall = JOB.slice(0, firstResult).findLastIndex((event) => event.type === 'user');
		return { ...base, name: 'clerk', job: true, running: true, turns: job(JOB.slice(0, lastCall)) };
	}

	// Everything Milton did, and not one word of the answer yet: the ONE quiet
	// line with a disclosure that replaced a stack of tool rows.
	if (state === 'working') {
		return {
			...base,
			running: true,
			turns: [
				{
					id: 'turn-1',
					question: question('How much recreation leave do I get each year?'),
					blocks: ACTIVITY.slice(0, 2),
					outcome: null
				}
			]
		};
	}

	if (state === 'streaming') {
		return {
			...base,
			running: true,
			turns: [
				{
					id: 'turn-1',
					question: question('How much recreation leave do I get each year?'),
					blocks: [...ACTIVITY, text(3, SHORT.slice(0, 210))],
					outcome: null
				}
			]
		};
	}

	// The TAIL of a settled answer: the source list with its trust marks, and
	// the follow-ups under it. The long answer's tail is 900px below the fold,
	// so the shot that proves those two is its own short scene rather than a
	// scroll position the driver has to hold.
	if (state === 'sources') {
		return {
			...base,
			turns: [
				{
					id: 'turn-1',
					question: question('How much recreation leave do I get each year?'),
					blocks: [...ACTIVITY, text(3, SHORT)],
					outcome: { turns: 3, durationMs: 8400 },
					citations: CITATIONS,
					suggestions: SUGGESTIONS
				}
			]
		};
	}

	if (state === 'attachments') {
		return {
			...base,
			value: 'Does this posting order change my leave balance?',
			files: [
				fakeFile('posting-order.pdf', 'application/pdf', 842_000),
				fakeFile('payslip-2026-08.png', 'image/png', 214_000),
				fakeFile('notes.md', 'text/markdown', 3_200)
			],
			turns: [
				{
					id: 'turn-1',
					question: question('How much recreation leave do I get each year?'),
					blocks: [...ACTIVITY, text(3, SHORT)],
					outcome: { turns: 3, durationMs: 8400 },
					citations: CITATIONS.slice(0, 2)
				}
			]
		};
	}

	// An answer Milton gave without citing anything. The one state where the
	// "he may not hold a document that covers it" line is the point of the shot.
	if (state === 'not-held') {
		return {
			...base,
			turns: [
				{
					id: 'turn-1',
					question: question('Does my unit run its own leave calendar?'),
					blocks: [
						tool(0, 'Grep', { pattern: 'unit leave calendar' }),
						text(1, UNCITED)
					],
					outcome: { turns: 2, durationMs: 5200 }
				}
			]
		};
	}

	// Milton goes back to the shelf part-way through, saying so as he goes. The
	// sentence is Milton's working-out, not his answer, and the shot is of it
	// folded into the activity line with the answer whole underneath.
	if (state === 'narration') {
		return {
			...base,
			turns: [
				{
					id: 'turn-1',
					question: question('How much recreation leave do I get each year?'),
					blocks: [
						...ACTIVITY,
						text(3, NARRATION),
						tool(4, 'Read', { file_path: '/data/staged/pacman-division-2/page-031.md' }),
						text(5, SHORT)
					],
					outcome: { turns: 4, durationMs: 9700 },
					citations: CITATIONS.slice(0, 2)
				}
			]
		};
	}

	// The session expired mid-conversation: the ask was redirected and blocked,
	// so the stream never opened. The turn says so in the persona's own voice
	// and settles, which is what re-enables Send — the shot to check is the
	// composer, which carries a live send button rather than a stop square.
	if (state === 'error') {
		return {
			...base,
			turns: [
				{
					id: 'turn-1',
					question: question('How much recreation leave do I get each year?'),
					blocks: ACTIVITY,
					outcome: { isError: true, unreachable: true },
					at: minutes(0)
				}
			]
		};
	}

	// Three turns, which is the state the director was actually looking at and
	// the one no single-turn shot can make a claim about: whether a
	// conversation reads AS a conversation — bounded cards, one voice against
	// the other, a measure a line of prose can be read across.
	if (state === 'chat') {
		return {
			...base,
			turns: [
				{
					id: 'turn-1',
					question: question('How much recreation leave do I get each year?'),
					blocks: [...ACTIVITY, text(3, SHORT)],
					outcome: { turns: 3, durationMs: 8400 },
					citations: CITATIONS.slice(0, 2),
					at: minutes(0)
				},
				{
					id: 'turn-2',
					question: question('Does my unit run its own leave calendar?'),
					blocks: [tool(0, 'Grep', { pattern: 'unit leave calendar' }), text(1, UNCITED)],
					outcome: { turns: 2, durationMs: 5200 },
					at: minutes(3)
				},
				{
					id: 'turn-3',
					question: question('Show me the carry-over caps by service category.'),
					blocks: [...ACTIVITY, text(3, splitAt(LONG, '## Carrying leave over')[0])],
					outcome: { turns: 4, durationMs: 11_200 },
					citations: CITATIONS,
					suggestions: SUGGESTIONS,
					at: minutes(5)
				}
			]
		};
	}

	// The same surface, answering as somebody else. Nothing in the package
	// names a persona any more, so every word here — the working line, the
	// uncited note, the scope label, the placeholder — follows this one prop.
	if (state === 'persona') {
		return {
			...base,
			name: 'penny',
			turns: [
				{
					id: 'turn-1',
					question: 'Which bills are waiting on my approval?',
					blocks: [tool(0, 'Grep', { pattern: 'pending approvals' }), text(1, PENNY)],
					outcome: { turns: 2, durationMs: 4100 },
					at: minutes(0)
				},
				{
					id: 'turn-2',
					question: 'And the one from the concrete supplier?',
					blocks: ACTIVITY.slice(0, 2),
					outcome: null,
					at: minutes(2)
				}
			],
			running: true
		};
	}

	if (state === 'stopped') {
		return {
			...base,
			turns: [
				{
					id: 'turn-1',
					question: question('How much recreation leave do I get each year?'),
					blocks: [...ACTIVITY, text(3, SHORT.slice(0, 120))],
					outcome: { turns: 2, durationMs: 3100 }
				}
			]
		};
	}

	// `answer` and `citations` render the same turn; the difference is whether
	// the source pane has been opened, which is a click the driver makes.
	//
	// Deliberately TWO text blocks, which catches a Sources block being lifted
	// off the joined answer rather than off the block that carries it. Both sit
	// AFTER the last tool call: a text block with a tool call still to come is
	// narration now, and an answer written around one would fold its own first
	// half away. The `narration` scene is that shape, on purpose.
	const [opening, rest] = splitAt(LONG, '## Carrying leave over');
	return {
		...base,
		turns: [
			{
				id: 'turn-1',
				question: question('How much recreation leave do I get each year?'),
				blocks: [
					...ACTIVITY,
					tool(3, 'Read', { file_path: '/data/staged/pacman-division-1/page-002.md' }),
					text(4, opening),
					text(5, rest)
				],
				outcome: { turns: 4, durationMs: 12_600 },
				citations: CITATIONS,
				suggestions: SUGGESTIONS
			}
		]
	};
}
