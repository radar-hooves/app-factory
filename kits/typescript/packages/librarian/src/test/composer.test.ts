/**
 * The scope chip renders only when there is a genuine pick between two or
 * more scopes (design-system, the fixed-scope Composer defect). A room with
 * one shelf set passes neither `documentName` nor `collectionName`, leaving
 * "The whole library" as the sole entry — and a sole entry is console
 * furniture, not a control.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Composer from '$lib/components/composer/composer.svelte';

describe('Composer scope chip', () => {
	it('renders nothing when the caller has fixed the scope', () => {
		render(Composer, {
			props: {
				value: '',
				running: false,
				scope: 'library',
				onscope: () => {},
				onsubmit: () => {},
				onstop: () => {}
			}
		});

		expect(screen.queryByText('The whole library')).not.toBeInTheDocument();
	});

	it('renders chips once a narrower scope is offered', () => {
		render(Composer, {
			props: {
				value: '',
				running: false,
				scope: 'library',
				collectionName: 'household-legal',
				onscope: () => {},
				onsubmit: () => {},
				onstop: () => {}
			}
		});

		expect(screen.getByText('The whole library')).toBeInTheDocument();
		expect(screen.getByText('household-legal')).toBeInTheDocument();
	});
});

describe('Composer placeholder', () => {
	it('asks Milton by name, never a bare "ask anything"', () => {
		render(Composer, {
			props: {
				value: '',
				running: false,
				scope: 'library',
				onscope: () => {},
				onsubmit: () => {},
				onstop: () => {}
			}
		});

		expect(screen.getByPlaceholderText('Ask Milton…')).toBeInTheDocument();
	});

	it("takes the host's own persona name in both states", () => {
		const { rerender } = render(Composer, {
			props: {
				value: '',
				running: false,
				scope: 'library',
				onscope: () => {},
				onsubmit: () => {},
				onstop: () => {},
				name: 'Penny'
			}
		});
		expect(screen.getByPlaceholderText('Ask Penny…')).toBeInTheDocument();

		rerender({
			value: '',
			running: true,
			scope: 'library',
			onscope: () => {},
			onsubmit: () => {},
			onstop: () => {},
			name: 'Penny'
		});
		expect(screen.getByPlaceholderText('Penny is answering…')).toBeInTheDocument();
	});
});

describe('Composer placeholder', () => {
	function composer(props: Record<string, unknown> = {}) {
		return render(Composer, {
			props: {
				value: '',
				running: false,
				scope: 'library',
				onscope: () => {},
				onsubmit: () => {},
				onstop: () => {},
				...props
			}
		});
	}

	it('asks for the library persona by default', () => {
		composer();
		expect(screen.getByPlaceholderText('Ask Milton…')).toBeInTheDocument();
	});

	it('asks for the host persona, capitalised from its slug', () => {
		composer({ name: 'penny' });
		expect(screen.getByPlaceholderText('Ask Penny…')).toBeInTheDocument();
	});

	it('says who is answering while the box is disabled', () => {
		composer({ name: 'penny', running: true });
		expect(screen.getByPlaceholderText('Penny is answering…')).toBeInTheDocument();
	});
});

describe('Composer while a session works', () => {
	function composer(props: Record<string, unknown>) {
		const onsubmit = vi.fn();
		const onstop = vi.fn();
		render(Composer, {
			props: { value: 'Skip the voided line.', running: true, onsubmit, onstop, ...props }
		});
		return { onsubmit, onstop };
	}

	it('waits, for a chat whose answer is still coming', () => {
		const { onsubmit } = composer({});
		expect(screen.getByRole('textbox')).toBeDisabled();
		expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
		expect(onsubmit).not.toHaveBeenCalled();
	});

	it('takes a message and offers Stop beside Send, for a session that reads one', async () => {
		const { onsubmit, onstop } = composer({ sendWhileRunning: true });
		expect(screen.getByRole('textbox')).toBeEnabled();
		expect(screen.getByPlaceholderText('Ask Milton…')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Send' }));
		expect(onsubmit).toHaveBeenCalledTimes(1);

		await fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
		expect(onsubmit).toHaveBeenCalledTimes(2);

		await fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
		expect(onstop).toHaveBeenCalledTimes(1);
	});

	it('keeps files for after the run', () => {
		composer({ sendWhileRunning: true });
		expect(screen.getByRole('button', { name: 'Attach a file' })).toBeDisabled();
	});
});
