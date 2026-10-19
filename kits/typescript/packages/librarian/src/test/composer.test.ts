/**
 * The collection picker renders only when there is a genuine pick: two or
 * more collections the person may read. With one, or none, there is nothing
 * to choose and nothing is there. However many there are, it is one control
 * (a person holding 27 once had a wall of chips taller than the box), and a
 * collection is shown by its title, never by its name or a retrieval summary.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import Composer from '$lib/components/composer/composer.svelte';

const COLLECTIONS = [
	{ name: 'adf-pay', title: 'ADF pay and conditions', description: 'Rates and leave' },
	{ name: 'housing', title: 'Defence housing and relocation' }
];

const MANY = Array.from({ length: 27 }, (_, n) => ({
	name: `subject-${n}`,
	title: n === 7 ? 'Radar' : `Subject ${n}`
}));

function base(props: Record<string, unknown> = {}) {
	return { value: '', running: false, onsubmit: () => {}, onstop: () => {}, ...props };
}

const control = () => screen.getByRole('button', { name: /^Where Assistant looks: / });

async function opened() {
	await fireEvent.click(control());
	return screen.getByRole('listbox', { name: 'Where Assistant looks' });
}

describe('Composer collection picker', () => {
	it('renders nothing when the person has no collection to choose between', () => {
		render(Composer, { props: base({ collections: [COLLECTIONS[0]] }) });
		expect(screen.queryByRole('button', { name: /looks/ })).not.toBeInTheDocument();
	});

	it('renders nothing when the host passes none', () => {
		render(Composer, { props: base() });
		expect(screen.queryByText('All your collections')).not.toBeInTheDocument();
	});

	it('is one control however many there are, saying where the question looks', () => {
		render(Composer, { props: base({ collections: MANY }) });
		expect(control()).toHaveTextContent('All your collections');
		expect(control()).toHaveAttribute('aria-haspopup', 'listbox');
		expect(control()).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByText('Subject 1')).not.toBeInTheDocument();
	});

	it('opens on all of them, then each by its title and never its name', async () => {
		render(Composer, { props: base({ collections: COLLECTIONS }) });
		const list = await opened();
		expect(control()).toHaveAttribute('aria-expanded', 'true');
		expect(within(list).getAllByRole('option').map((o) => o.textContent?.trim())).toEqual([
			'All your collections',
			'ADF pay and conditions Rates and leave',
			'Defence housing and relocation'
		]);
		expect(within(list).getByRole('option', { name: /All your collections/ })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		expect(screen.queryByText('adf-pay')).not.toBeInTheDocument();
	});

	it('reads a slug as a title where the library has none, and never shows a summary', async () => {
		const collections = [
			{ name: 'defence-housing', summary: 'FILING: pipeline text, 4 documents' },
			{ name: 'adf_pay' }
		];
		render(Composer, { props: base({ collections }) });
		const list = await opened();
		expect(within(list).getByRole('option', { name: 'Defence housing' })).toBeInTheDocument();
		expect(within(list).getByRole('option', { name: 'Adf pay' })).toBeInTheDocument();
		expect(screen.queryByText(/FILING/)).not.toBeInTheDocument();
	});

	it('shows the chosen one on the control and hands the host its name on a pick', async () => {
		const oncollection = vi.fn();
		render(Composer, {
			props: base({ collections: COLLECTIONS, collection: 'housing', oncollection })
		});
		expect(control()).toHaveTextContent('Defence housing and relocation');
		const list = await opened();
		expect(
			within(list).getByRole('option', { name: 'Defence housing and relocation' })
		).toHaveAttribute('aria-selected', 'true');

		await fireEvent.click(within(list).getByRole('option', { name: /ADF pay and conditions/ }));
		expect(oncollection).toHaveBeenLastCalledWith('adf-pay');
		expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
		expect(screen.getByRole('textbox')).toHaveFocus();

		await fireEvent.click(within(await opened()).getByRole('option', { name: /All your/ }));
		expect(oncollection).toHaveBeenLastCalledWith(undefined);
	});

	it('is driven from the keyboard, and Escape hands focus back', async () => {
		const oncollection = vi.fn();
		render(Composer, { props: base({ collections: COLLECTIONS, oncollection }) });
		control().focus();
		await fireEvent.keyDown(control(), { key: 'ArrowDown' });
		const list = screen.getByRole('listbox');
		expect(list).toHaveFocus();
		expect(list.getAttribute('aria-activedescendant')).toBe(
			within(list).getByRole('option', { name: /All your/ }).id
		);

		await fireEvent.keyDown(list, { key: 'Escape' });
		expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
		expect(control()).toHaveFocus();

		await fireEvent.keyDown(control(), { key: 'ArrowDown' });
		await fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
		await fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
		expect(oncollection).toHaveBeenLastCalledWith('adf-pay');
	});

	it('closes when focus leaves it for somewhere else on the page', async () => {
		render(Composer, { props: base({ collections: COLLECTIONS }) });
		const list = await opened();
		await fireEvent.focusOut(list, { relatedTarget: screen.getByRole('textbox') });
		expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
	});

	it('takes a search from a long list up, and Enter picks the first match', async () => {
		const oncollection = vi.fn();
		render(Composer, { props: base({ collections: MANY, oncollection }) });
		await fireEvent.click(control());
		const field = screen.getByRole('combobox', { name: 'Where Assistant looks' });
		expect(field).toHaveFocus();

		await fireEvent.input(field, { target: { value: 'rad' } });
		expect(screen.getAllByRole('option').map((o) => o.textContent?.trim())).toEqual(['Radar']);
		await fireEvent.keyDown(field, { key: 'Enter' });
		expect(oncollection).toHaveBeenLastCalledWith('subject-7');

		await fireEvent.click(control());
		await fireEvent.input(screen.getByRole('combobox'), { target: { value: 'zzz' } });
		expect(screen.getByText('Nothing matches that.')).toBeInTheDocument();
	});

	it('is named for the persona it asks', () => {
		render(Composer, { props: base({ collections: COLLECTIONS, name: 'Outrider' }) });
		expect(
			screen.getByRole('button', { name: 'Where Outrider looks: All your collections' })
		).toBeInTheDocument();
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
