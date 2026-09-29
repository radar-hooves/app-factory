/**
 * An artefact a turn produced: carded under its answer in the host's words,
 * and opened wherever the host keeps it.
 *
 * Two artefacts share the card. One is something BESIDE the answer — a
 * structured reading the persona handed in while it explained itself — so the
 * prose stays and the card sits under it. The other IS the answer — a
 * briefing — so the prose goes to the reading column and the card stands in
 * for it.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import AgentTranscript from '$lib/components/agent-transcript/agent-transcript.svelte';
import Conversation from '$lib/components/conversation/conversation.svelte';
import Composer from '$lib/components/composer/composer.svelte';
import type { Artefact, Block, Turn } from '$lib/transcript.svelte';

const PROSE = 'I read 6 lines. They add up exactly to the printed total, $42.38.';
const BLOCKS: Block[] = [{ kind: 'text', index: 0, text: PROSE }];
const READING: Artefact = {
	title: 'What it read',
	summary: '6 lines and 3 details · adds up to $42.38'
};

function turn(props: Record<string, unknown> = {}) {
	return render(AgentTranscript, {
		props: {
			question: 'File this document.',
			blocks: BLOCKS,
			outcome: { turns: 4, durationMs: 9000 },
			running: false,
			artefact: READING,
			...props
		}
	});
}

describe('an artefact beside its answer', () => {
	it('keeps the prose and cards the artefact under it, in the host’s words', () => {
		turn({ onopenartefact: () => {} });
		expect(screen.getByText(PROSE)).toBeInTheDocument();
		const card = screen.getByRole('button', { name: /What it read/ });
		expect(card).toHaveTextContent('6 lines and 3 details · adds up to $42.38');
		expect(card).toHaveTextContent('Open');
		expect(screen.queryByText(/Briefing/)).not.toBeInTheDocument();
	});

	it('says it is showing while the host shows it', () => {
		turn({ onopenartefact: () => {}, artefactOpen: true });
		expect(screen.getByRole('button', { name: /What it read/ })).toHaveTextContent('Showing');
	});

	it('informs and offers no action where nothing can open it', () => {
		turn();
		const card = screen.getByRole('button', { name: /What it read/ });
		expect(card).toBeDisabled();
		expect(card).not.toHaveTextContent('Open');
	});

	it('waits for the turn to settle', () => {
		turn({ running: true, outcome: null, onopenartefact: () => {} });
		expect(screen.queryByRole('button', { name: /What it read/ })).not.toBeInTheDocument();
	});
});

describe('an artefact that is its answer', () => {
	it('stands in for the prose', () => {
		turn({ artefact: { title: 'Briefing', isAnswer: true }, onopenartefact: () => {} });
		expect(screen.queryByText(PROSE)).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Briefing/ })).toBeInTheDocument();
	});
});

describe('Conversation and a host that opens artefacts itself', () => {
	const TURNS: Turn[] = [
		{ id: 'run-1', question: 'File this document.', blocks: BLOCKS, outcome: {}, artefact: READING }
	];

	it('hands the tap to the host and opens no pane of its own', async () => {
		const onopenartefact = vi.fn();
		render(Conversation, { props: { turns: TURNS, running: false, onopenartefact } });
		await fireEvent.click(screen.getByRole('button', { name: /What it read/ }));
		expect(onopenartefact).toHaveBeenCalledWith(TURNS[0]);
		expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
	});

	it('marks the turn the host says it is showing', () => {
		render(Conversation, {
			props: { turns: TURNS, running: false, onopenartefact: () => {}, showing: 'run-1' }
		});
		expect(screen.getByRole('button', { name: /What it read/ })).toHaveTextContent('Showing');
	});

	it('opens an artefact that is its answer in its own pane when the host has none', async () => {
		const briefing: Turn[] = [{ ...TURNS[0], artefact: { title: 'Briefing', isAnswer: true } }];
		render(Conversation, { props: { turns: briefing, running: false } });
		await fireEvent.click(screen.getByRole('button', { name: /Briefing/ }));
		expect(screen.getByRole('complementary', { name: 'Study artefact' })).toBeInTheDocument();
	});
});

describe('Composer on a surface with one scope', () => {
	it('takes no scope, offers no choice, and says what sending does', () => {
		render(Composer, {
			props: {
				value: '',
				running: false,
				onsubmit: () => {},
				onstop: () => {},
				note: 'It carries on from where it stopped.',
				copy: { askPlaceholder: 'Tell it something…' }
			}
		});
		expect(screen.getByPlaceholderText('Tell it something…')).toBeInTheDocument();
		expect(screen.getByText('It carries on from where it stopped.')).toBeInTheDocument();
		expect(screen.queryByText('The whole library')).not.toBeInTheDocument();
	});

	it('offers Stop while the session works', () => {
		render(Composer, {
			props: { value: '', running: true, onsubmit: () => {}, onstop: () => {} }
		});
		expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
	});
});
