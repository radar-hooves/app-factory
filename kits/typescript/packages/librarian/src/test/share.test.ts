/**
 * Sharing an answer: nothing is shared until the reader asks, a share copies
 * its link, and the reader who shared it can stop.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import AgentTranscript from '$lib/components/agent-transcript/agent-transcript.svelte';
import Conversation from '$lib/components/conversation/conversation.svelte';
import type { Block, Turn } from '$lib/transcript.svelte';

const ANSWER: Block[] = [{ kind: 'text', index: 0, text: 'Twenty days a year.' }];
const ADDRESS = '/rooms/manual/answers/c1/0';

function answer(props: Record<string, unknown> = {}) {
	return render(AgentTranscript, {
		props: { question: 'How much leave?', blocks: ANSWER, outcome: null, running: false, ...props }
	});
}

function clipboard() {
	const writeText = vi.fn(async () => undefined);
	Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
	return writeText;
}

describe('the share control', () => {
	it('is absent unless the host can share', () => {
		answer();
		expect(screen.queryByRole('button', { name: /Share/ })).not.toBeInTheDocument();
	});

	it('shares on a tap and copies the whole link', async () => {
		const writeText = clipboard();
		const onshare = vi.fn(async () => true);
		const view = answer({ onshare });
		await fireEvent.click(screen.getByRole('button', { name: /Share/ }));
		expect(onshare).toHaveBeenCalledWith(true);

		await view.rerender({ onshare, shared: ADDRESS });
		expect(screen.getByRole('status')).toHaveTextContent(
			'Shared: anyone who can ask Milton here can open the link.'
		);
		await fireEvent.click(screen.getByRole('button', { name: /Copy link/ }));
		expect(writeText).toHaveBeenLastCalledWith(new URL(ADDRESS, location.href).href);
		expect(await screen.findByRole('button', { name: /Link copied/ })).toBeInTheDocument();
	});

	it('stops sharing', async () => {
		const onshare = vi.fn(async () => true);
		answer({ onshare, shared: ADDRESS });
		await fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
		expect(onshare).toHaveBeenCalledWith(false);
	});

	it('says so when a share did not go through', async () => {
		answer({ onshare: vi.fn(async () => false) });
		await fireEvent.click(screen.getByRole('button', { name: /Share/ }));
		expect(await screen.findByRole('status')).toHaveTextContent(
			"That didn't go through. Try again."
		);
	});
});

describe('Conversation sharing', () => {
	const turns: Turn[] = [
		{ id: 'a', question: 'One?', blocks: ANSWER, outcome: null },
		{ id: 'b', question: 'Two?', blocks: [], outcome: null }
	];

	it('offers every settled answer, never the one still being written', () => {
		render(Conversation, { props: { turns, running: true, onshare: vi.fn(async () => true) } });
		expect(screen.getAllByRole('button', { name: /Share/ })).toHaveLength(1);
	});

	it('hands the host the turn it shares', async () => {
		const onshare = vi.fn(async () => true);
		render(Conversation, { props: { turns: turns.slice(0, 1), running: false, onshare } });
		await fireEvent.click(screen.getByRole('button', { name: /Share/ }));
		expect(onshare).toHaveBeenCalledWith(turns[0], true);
	});
});
