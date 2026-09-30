/**
 * An answer that has not started, and one this page did not see start.
 *
 * Both sit where the working line sits, beside its clock: the question waits
 * behind somebody else's, or the answer is still being written for a
 * conversation reopened mid-answer, whose clock counts from when it began.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Conversation from '$lib/components/conversation/conversation.svelte';
import Working from '$lib/components/working/working.svelte';
import type { Turn } from '$lib/transcript.svelte';

const ASKED: Turn[] = [{ id: '1', question: 'And the tax?', blocks: [], outcome: null }];

describe('Waiting and still answering', () => {
	it('says the question waits behind another, in the persona’s name', () => {
		render(Conversation, { props: { turns: ASKED, running: true, waiting: true, name: 'penny' } });
		expect(screen.getByText('Penny is answering another question first…')).toBeInTheDocument();
	});

	it('says an answer begun elsewhere is still being written, clocked from when it began', () => {
		const answering = Date.now() - 90_000;
		render(Conversation, { props: { turns: ASKED, running: true, answering } });
		expect(screen.getByText('Milton is still answering…')).toBeInTheDocument();
		expect(screen.getByText('90s')).toBeInTheDocument();
	});

	it('says neither on an answer that is simply arriving', () => {
		render(Conversation, { props: { turns: ASKED, running: true } });
		expect(screen.getByText('Milton is looking…')).toBeInTheDocument();
		expect(screen.getByText('0s')).toBeInTheDocument();
	});

	it('counts from a start it is given', () => {
		render(Working, { props: { since: Date.now() - 5_000 } });
		expect(screen.getByText('5s')).toBeInTheDocument();
	});
});
