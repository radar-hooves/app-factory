/**
 * Helpful or not, on the answer just read.
 *
 * It renders only where the host can record it, as follow-ups render only
 * with `onsuggest`; a verdict shows at once and is taken back if it was not
 * recorded; and a note says "noted" only once it was.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Conversation from '$lib/components/conversation/conversation.svelte';
import AnswerMark from '$lib/components/answer-mark/answer-mark.svelte';
import type { Turn } from '$lib/transcript.svelte';

const answered = (id: string, text: string): Turn => ({
	id,
	question: `Question ${id}`,
	blocks: [{ kind: 'text', index: 0, text }],
	outcome: { turns: 1, durationMs: 1000 }
});

const TURNS = [answered('1', 'Twenty days.'), answered('2', 'Fifty cents.')];

describe('The answer mark in a conversation', () => {
	it('renders nothing without onmark', () => {
		render(Conversation, { props: { turns: TURNS, running: false } });
		expect(screen.queryByRole('button', { name: 'Helpful' })).not.toBeInTheDocument();
	});

	it('marks the last answer only, and hands the host that turn', async () => {
		const onmark = vi.fn(async () => true);
		render(Conversation, { props: { turns: TURNS, running: false, onmark } });
		expect(screen.getAllByRole('button', { name: 'Helpful' })).toHaveLength(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
		expect(onmark).toHaveBeenCalledWith(TURNS[1], { helpful: true, note: null });
	});

	it('offers no mark on an answer still arriving, or one that failed', async () => {
		const onmark = vi.fn(async () => true);
		const failed: Turn = { ...answered('3', ''), blocks: [], outcome: { isError: true } };
		const view = render(Conversation, { props: { turns: TURNS, running: true, onmark } });
		expect(screen.queryByRole('button', { name: 'Helpful' })).not.toBeInTheDocument();
		await view.rerender({ turns: [...TURNS, failed], running: false, onmark });
		expect(screen.getByText('Milton stopped before finishing this one.')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Helpful' })).not.toBeInTheDocument();
	});
});

describe('AnswerMark', () => {
	it('shows a verdict at once, then opens an optional note', async () => {
		const onmark = vi.fn(async () => true);
		render(AnswerMark, { props: { onmark } });
		const helpful = screen.getByRole('button', { name: 'Helpful' });
		expect(helpful).toHaveAttribute('aria-pressed', 'false');
		expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

		await fireEvent.click(helpful);
		expect(helpful).toHaveAttribute('aria-pressed', 'true');
		const note = screen.getByRole('textbox', { name: 'Anything to add? (optional)' });

		await fireEvent.input(note, { target: { value: 'Spot on' } });
		await fireEvent.submit(note.closest('form')!);
		expect(onmark).toHaveBeenLastCalledWith({ helpful: true, note: 'Spot on' });
		expect(await screen.findByText('Thanks, noted.')).toBeInTheDocument();
		expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
	});

	it('takes a verdict back that was not recorded, and says so', async () => {
		const onmark = vi.fn(async () => false);
		render(AnswerMark, { props: { onmark } });
		const unhelpful = screen.getByRole('button', { name: 'Not helpful' });
		await fireEvent.click(unhelpful);
		expect(await screen.findByText("That couldn't be sent. Nothing was recorded.")).toBeInTheDocument();
		expect(unhelpful).toHaveAttribute('aria-pressed', 'false');
	});

	it('keeps a note that was not recorded in its box, to try again', async () => {
		const onmark = vi.fn(async (verdict: { note?: string | null }) => !verdict.note);
		render(AnswerMark, { props: { onmark } });
		await fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
		const note = screen.getByRole('textbox');
		await fireEvent.input(note, { target: { value: 'Spot on' } });
		await fireEvent.submit(note.closest('form')!);

		expect(await screen.findByText("That couldn't be sent. Nothing was recorded.")).toBeInTheDocument();
		expect(screen.queryByText('Thanks, noted.')).not.toBeInTheDocument();
		expect(screen.getByRole('textbox')).toHaveValue('Spot on');
	});

	it('sends the recorded note again with a changed verdict, since each replaces the last', async () => {
		const onmark = vi.fn(async () => true);
		render(AnswerMark, { props: { onmark } });
		await fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
		const note = screen.getByRole('textbox');
		await fireEvent.input(note, { target: { value: 'Close' } });
		await fireEvent.submit(note.closest('form')!);
		await screen.findByText('Thanks, noted.');

		await fireEvent.click(screen.getByRole('button', { name: 'Not helpful' }));
		expect(onmark).toHaveBeenLastCalledWith({ helpful: false, note: 'Close' });
	});
});
