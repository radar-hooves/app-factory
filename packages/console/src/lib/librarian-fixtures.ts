/**
 * Every state the librarian surface can be in, as data.
 *
 * Fixtures rather than a live stream on purpose: a screenshot grid across
 * three widths and two themes has to render the SAME answer every time, and a
 * real model does not. What is faked here is the stream; everything the
 * components then do with it — folding, measuring, citing — is the shipped
 * code (`rules-library/core/verification.md` §Scripts Drive, Models Judge).
 */

import type { Block, Turn } from '@poodle64/librarian/transcript';
import type { Citation, LoadedDocument } from '@poodle64/librarian/citations';

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

export type LabState =
	| 'empty'
	| 'working'
	| 'streaming'
	| 'answer'
	| 'citations'
	| 'sources'
	| 'attachments'
	| 'error'
	| 'stopped'
	| 'not-held';

export interface LabScene {
	turns: Turn[];
	running: boolean;
	value: string;
	files: File[];
}

function fakeFile(name: string, type: string, size: number): File {
	const made = new File([''], name, { type });
	Object.defineProperty(made, 'size', { value: size });
	return made;
}

export function scene(state: LabState): LabScene {
	const base: LabScene = { turns: [], running: false, value: '', files: [] };

	if (state === 'empty') return base;

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

	if (state === 'error') {
		return {
			...base,
			turns: [
				{
					id: 'turn-1',
					question: question('How much recreation leave do I get each year?'),
					blocks: ACTIVITY,
					outcome: { isError: true, error: "Milton can't be reached right now." }
				}
			]
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
	// Deliberately TWO text blocks with a tool call between them, which is the
	// real shape of an answer Milton goes back to the shelf part-way through —
	// and the shape that catches a Sources block being lifted off the joined
	// answer rather than off the block that carries it.
	const [opening, rest] = splitAt(LONG, '## Carrying leave over');
	return {
		...base,
		turns: [
			{
				id: 'turn-1',
				question: question('How much recreation leave do I get each year?'),
				blocks: [
					...ACTIVITY,
					text(3, opening),
					tool(4, 'Read', { file_path: '/data/staged/pacman-division-1/page-002.md' }),
					text(5, rest)
				],
				outcome: { turns: 4, durationMs: 12_600 },
				citations: CITATIONS,
				suggestions: SUGGESTIONS
			}
		]
	};
}
