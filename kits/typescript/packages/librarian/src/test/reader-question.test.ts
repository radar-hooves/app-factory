/**
 * A colleague never sees the instruction the host wrote for the model. cadmus
 * sends `{room.preamble}\n\n{question}`, and the preamble opens "You are
 * Milton, the librarian for…".
 */
import { describe, it, expect } from 'vitest';
import { readerQuestion } from '$lib/transcript.svelte';

const PREAMBLE =
	'You are Milton, the librarian for the ADF Pay and Conditions room. Answer a Defence ' +
	"colleague's question about pay, allowances, leave and conditions of service.";

describe('readerQuestion()', () => {
	it('drops the system preamble a host prepends', () => {
		const shown = readerQuestion(`${PREAMBLE}\n\nHow much recreation leave do I get?`);
		expect(shown).toBe('How much recreation leave do I get?');
		expect(shown).not.toContain('Milton');
	});

	it('keeps a multi-paragraph question intact', () => {
		const asked = 'I am posted in March.\n\nDoes my leave carry over?';
		expect(readerQuestion(`${PREAMBLE}\n\n${asked}`)).toBe(asked);
	});

	it('leaves a question that was never prefixed exactly as asked', () => {
		expect(readerQuestion('How much recreation leave do I get?')).toBe(
			'How much recreation leave do I get?'
		);
	});

	it('never eats the last paragraph, however it opens', () => {
		expect(readerQuestion('You are wrong about the leave rule.')).toBe(
			'You are wrong about the leave rule.'
		);
	});
});
