/**
 * The collection picker renders only when there is a genuine pick: two or
 * more collections the person may read. With one, or none, there is nothing
 * to choose and the row is not there. A collection is shown by its title,
 * never by its name or a retrieval summary.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Composer from '$lib/components/composer/composer.svelte';

const COLLECTIONS = [
	{ name: 'adf-pay', title: 'ADF pay and conditions', description: 'Rates and leave' },
	{ name: 'housing', title: 'Defence housing and relocation' }
];

function base(props: Record<string, unknown> = {}) {
	return { value: '', running: false, onsubmit: () => {}, onstop: () => {}, ...props };
}

describe('Composer collection picker', () => {
	it('renders nothing when the person has no collection to choose between', () => {
		render(Composer, { props: base({ collections: [COLLECTIONS[0]] }) });
		expect(screen.queryByText('All your collections')).not.toBeInTheDocument();
	});

	it('renders nothing when the host passes none', () => {
		render(Composer, { props: base() });
		expect(screen.queryByText('All your collections')).not.toBeInTheDocument();
	});

	it('offers all of them, then each by its title and never its name', () => {
		render(Composer, { props: base({ collections: COLLECTIONS }) });
		expect(screen.getByRole('button', { name: 'All your collections' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(screen.getByRole('button', { name: 'ADF pay and conditions' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Defence housing and relocation' })).toBeInTheDocument();
		expect(screen.queryByText('adf-pay')).not.toBeInTheDocument();
	});

	it('reads a slug as a title where the library has none, and never shows a summary', () => {
		const collections = [
			{ name: 'defence-housing', summary: 'FILING: pipeline text, 4 documents' },
			{ name: 'adf_pay' }
		];
		render(Composer, { props: base({ collections }) });
		expect(screen.getByRole('button', { name: 'Defence housing' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Adf pay' })).toBeInTheDocument();
		expect(screen.queryByText(/FILING/)).not.toBeInTheDocument();
	});

	it('carries the description as the chip’s hover', () => {
		render(Composer, { props: base({ collections: COLLECTIONS }) });
		expect(screen.getByRole('button', { name: 'ADF pay and conditions' })).toHaveAttribute('title', 'Rates and leave');
	});

	it('marks the chosen collection and hands the host its name on a tap', async () => {
		const oncollection = vi.fn();
		render(Composer, {
			props: base({ collections: COLLECTIONS, collection: 'housing', oncollection })
		});
		expect(
			screen.getByRole('button', { name: 'Defence housing and relocation' })
		).toHaveAttribute('aria-pressed', 'true');

		await fireEvent.click(screen.getByRole('button', { name: 'ADF pay and conditions' }));
		expect(oncollection).toHaveBeenLastCalledWith('adf-pay');
		await fireEvent.click(screen.getByRole('button', { name: 'All your collections' }));
		expect(oncollection).toHaveBeenLastCalledWith(undefined);
	});

	it('is named for the persona it asks', () => {
		render(Composer, { props: base({ collections: COLLECTIONS, name: 'Outrider' }) });
		expect(screen.getByRole('group', { name: 'Where Outrider looks' })).toBeInTheDocument();
	});
});

describe('Composer placeholder', () => {
	it('asks the persona by name, never a bare "ask anything"', () => {
		render(Composer, {
			props: {
				value: '',
				running: false,
				onsubmit: () => {},
				onstop: () => {}
			}
		});

		expect(screen.getByPlaceholderText('Ask Assistant…')).toBeInTheDocument();
	});

	it("takes the host's own persona name in both states", () => {
		const { rerender } = render(Composer, {
			props: {
				value: '',
				running: false,
				onsubmit: () => {},
				onstop: () => {},
				name: 'Penny'
			}
		});
		expect(screen.getByPlaceholderText('Ask Penny…')).toBeInTheDocument();

		rerender({
			value: '',
			running: true,
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
				onsubmit: () => {},
				onstop: () => {},
				...props
			}
		});
	}

	it('asks for the neutral default persona', () => {
		composer();
		expect(screen.getByPlaceholderText('Ask Assistant…')).toBeInTheDocument();
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

describe('Composer long-conversation banner', () => {
	function composer(props: Record<string, unknown> = {}) {
		return render(Composer, {
			props: {
				value: '',
				running: false,
				onsubmit: () => {},
				onstop: () => {},
				...props
			}
		});
	}

	it('says nothing when the host never counts turns', () => {
		composer();
		expect(screen.queryByText(/getting long/)).not.toBeInTheDocument();
	});

	it('says nothing under the limit', () => {
		composer({ turnCount: 3, onnewquestion: () => {} });
		expect(screen.queryByText(/getting long/)).not.toBeInTheDocument();
	});

	it('offers to start over past the limit, and nowhere without a handler', () => {
		composer({ turnCount: 9 });
		expect(screen.queryByText(/getting long/)).not.toBeInTheDocument();
	});

	it('offers "New question" past the limit, with a handler', async () => {
		const onnewquestion = vi.fn();
		composer({ turnCount: 9, onnewquestion });
		expect(
			screen.getByText('This conversation is getting long. A new question keeps Assistant quick.')
		).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'New question' }));
		expect(onnewquestion).toHaveBeenCalledTimes(1);
	});

	it('honours a host-chosen limit', () => {
		composer({ turnCount: 5, turnLimit: 4, onnewquestion: () => {} });
		expect(screen.getByText(/getting long/)).toBeInTheDocument();
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
		expect(screen.getByPlaceholderText('Ask Assistant…')).toBeInTheDocument();

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
