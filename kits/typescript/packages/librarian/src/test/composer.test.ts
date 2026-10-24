/**
 * The collection picker renders only when there is a genuine pick: two or
 * more collections the person may read. With one, or none, there is nothing
 * to choose and nothing is there. However many there are, it is one control
 * (a person holding 27 once had a wall of chips taller than the box), and a
 * collection is shown by its title, never by its name or a retrieval summary.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import Composer from '$lib/components/composer/composer.svelte';

const COLLECTIONS = [
	{ name: 'adf-pay', title: 'ADF pay and conditions' },
	{ name: 'housing', title: 'Defence housing and relocation' }
];

const PAY = { name: 'pay', title: 'Pay and conditions' };
const HOME = { name: 'home', title: 'Housing' };
const GROUPED = [
	{ name: 'adf-pay', title: 'ADF pay and conditions: the full instrument', shortTitle: 'ADF pay', group: PAY },
	{ name: 'leave', title: 'Leave entitlements under the determination', shortTitle: 'Leave', group: PAY },
	{ name: 'housing', title: 'Defence housing and relocation', group: HOME },
	{ name: 'loose', title: 'Something unfiled' }
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
		expect(control()).toHaveAttribute('aria-haspopup', 'dialog');
		expect(control()).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByText('Subject 1')).not.toBeInTheDocument();
	});

	it('opens on all of them, then each by its title and never its name', async () => {
		render(Composer, { props: base({ collections: COLLECTIONS }) });
		const list = await opened();
		expect(control()).toHaveAttribute('aria-expanded', 'true');
		expect(within(list).getAllByRole('option').map((o) => o.textContent?.trim())).toEqual([
			'All your collections',
			'ADF pay and conditions',
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

describe('Composer collection picker, by subject', () => {
	const subjects = () => screen.getByRole('listbox', { name: 'Subjects' });
	const names = (list: HTMLElement) =>
		within(list).getAllByRole('option').map((o) => o.textContent?.replace(/\s+/g, ' ').trim());
	/** The pane on the right: named for the subject it shows. */
	const contents = (subject: string) => screen.getByRole('listbox', { name: subject });

	async function pane() {
		await fireEvent.click(control());
		return subjects();
	}

	it('lists the subjects in order with their counts, then what has none', async () => {
		render(Composer, { props: base({ collections: GROUPED }) });
		const list = await pane();
		expect(names(list)).toEqual([
			'All your collections',
			'Pay and conditions 2',
			'Housing 1',
			'Something unfiled'
		]);
		expect(within(list).getByRole('option', { name: 'Pay and conditions, 2 to choose from' })).toBeInTheDocument();
	});

	it('opens on the first subject: it taken whole, then each collection by its short title', async () => {
		render(Composer, { props: base({ collections: GROUPED }) });
		await pane();
		const right = contents('Pay and conditions');
		expect(names(right)).toEqual(['All of Pay and conditions', 'ADF pay', 'Leave']);
		const row = within(right).getByRole('option', { name: 'ADF pay' });
		expect(row).toHaveAttribute('title', 'ADF pay and conditions: the full instrument');
	});

	it('browses a subject without choosing anything', async () => {
		const oncollection = vi.fn();
		const ongroup = vi.fn();
		render(Composer, { props: base({ collections: GROUPED, oncollection, ongroup }) });
		const list = await pane();
		await fireEvent.pointerMove(within(list).getByRole('option', { name: /^Housing/ }));
		expect(names(contents('Housing'))).toEqual([
			'All of Housing',
			'Defence housing and relocation'
		]);
		await fireEvent.click(within(list).getByRole('option', { name: /^Pay and conditions/ }));
		expect(names(contents('Pay and conditions'))).toContain('Leave');
		expect(oncollection).not.toHaveBeenCalled();
		expect(ongroup).not.toHaveBeenCalled();
		expect(subjects()).toBeInTheDocument();
		expect(control()).toHaveTextContent('All your collections');
	});

	it('picks a collection from the right and closes', async () => {
		const oncollection = vi.fn();
		const ongroup = vi.fn();
		render(Composer, { props: base({ collections: GROUPED, oncollection, ongroup }) });
		await pane();
		await fireEvent.click(within(contents('Pay and conditions')).getByRole('option', { name: 'Leave' }));
		expect(oncollection).toHaveBeenLastCalledWith('leave');
		expect(ongroup).toHaveBeenLastCalledWith(undefined);
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(screen.getByRole('textbox')).toHaveFocus();
	});

	it('takes a whole subject, telling the host the subject and no collection', async () => {
		const oncollection = vi.fn();
		const ongroup = vi.fn();
		render(Composer, { props: base({ collections: GROUPED, oncollection, ongroup }) });
		await pane();
		await fireEvent.click(
			within(contents('Pay and conditions')).getByRole('option', { name: 'All of Pay and conditions' })
		);
		expect(ongroup).toHaveBeenLastCalledWith('pay');
		expect(oncollection).toHaveBeenLastCalledWith(undefined);
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('asks across everything, and a loose collection is a pick of its own', async () => {
		const oncollection = vi.fn();
		const ongroup = vi.fn();
		render(Composer, { props: base({ collections: GROUPED, oncollection, ongroup }) });
		await fireEvent.click(within(await pane()).getByRole('option', { name: 'All your collections' }));
		expect(oncollection).toHaveBeenLastCalledWith(undefined);
		expect(ongroup).toHaveBeenLastCalledWith(undefined);

		await fireEvent.click(within(await pane()).getByRole('option', { name: 'Something unfiled' }));
		expect(oncollection).toHaveBeenLastCalledWith('loose');
	});

	it('shows a chosen subject on the chip and reopens on it, with it ticked', async () => {
		render(Composer, { props: base({ collections: GROUPED, group: 'pay' }) });
		expect(control()).toHaveTextContent('Pay and conditions');
		await pane();
		expect(
			within(contents('Pay and conditions')).getByRole('option', { name: 'All of Pay and conditions' })
		).toHaveAttribute('aria-selected', 'true');
		expect(within(subjects()).getByRole('option', { name: /^All your/ })).toHaveAttribute('aria-selected', 'false');
	});

	it('reopens on the subject of a chosen collection, with that collection ticked', async () => {
		render(Composer, { props: base({ collections: GROUPED, collection: 'housing' }) });
		expect(control()).toHaveTextContent('Defence housing and relocation');
		await pane();
		expect(
			within(contents('Housing')).getByRole('option', { name: 'Defence housing and relocation' })
		).toHaveAttribute('aria-selected', 'true');
		expect(within(subjects()).getByRole('option', { name: /^Housing/ })).toHaveAttribute('aria-current', 'true');
	});

	it('searches short title, full title and subject, one flat list with the subject beside each', async () => {
		render(Composer, { props: base({ collections: [...GROUPED, ...MANY] }) });
		await fireEvent.click(control());
		const field = screen.getByRole('combobox');
		expect(field).toHaveFocus();
		const type = async (value: string) => {
			await fireEvent.input(field, { target: { value } });
			return screen.getAllByRole('option').map((o) => o.textContent?.replace(/\s+/g, ' ').trim());
		};
		expect(await type('adf')).toEqual(['ADF pay Pay and conditions']);
		expect(screen.getByRole('option', { name: 'ADF pay, in Pay and conditions' })).toBeInTheDocument();
		expect(await type('determination')).toEqual(['Leave Pay and conditions']);
		expect(await type('housing')).toEqual([
			'All of Housing',
			'Defence housing and relocation Housing'
		]);
		expect(screen.queryByRole('listbox', { name: 'Subjects' })).not.toBeInTheDocument();

		await fireEvent.input(field, { target: { value: '' } });
		expect(screen.getByRole('listbox', { name: 'Subjects' })).toBeInTheDocument();
	});

	it('picks a search match with Enter, as its subject whole or as the collection', async () => {
		const oncollection = vi.fn();
		const ongroup = vi.fn();
		render(Composer, { props: base({ collections: [...GROUPED, ...MANY], oncollection, ongroup }) });
		await fireEvent.click(control());
		const field = screen.getByRole('combobox');
		await fireEvent.input(field, { target: { value: 'housing' } });
		await fireEvent.keyDown(field, { key: 'Enter' });
		expect(ongroup).toHaveBeenLastCalledWith('home');

		await fireEvent.click(control());
		await fireEvent.input(screen.getByRole('combobox'), { target: { value: 'leave' } });
		await fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
		expect(oncollection).toHaveBeenLastCalledWith('leave');
	});

	it('is driven from the keyboard: arrows browse, Enter goes in, Enter picks, Escape hands back', async () => {
		const oncollection = vi.fn();
		const ongroup = vi.fn();
		render(Composer, { props: base({ collections: GROUPED, oncollection, ongroup }) });
		control().focus();
		await fireEvent.keyDown(control(), { key: 'ArrowDown' });
		const list = subjects();
		expect(list).toHaveFocus();

		await fireEvent.keyDown(list, { key: 'ArrowDown' });
		expect(list.getAttribute('aria-activedescendant')).toBe(
			within(list).getByRole('option', { name: /^Pay and conditions/ }).id
		);
		await fireEvent.keyDown(list, { key: 'ArrowDown' });
		expect(names(contents('Housing'))).toContain('All of Housing');
		expect(oncollection).not.toHaveBeenCalled();

		await fireEvent.keyDown(list, { key: 'Enter' });
		const right = contents('Housing');
		expect(right).toHaveFocus();
		await fireEvent.keyDown(right, { key: 'ArrowDown' });
		await fireEvent.keyDown(right, { key: 'Enter' });
		expect(oncollection).toHaveBeenLastCalledWith('housing');

		await fireEvent.keyDown(control(), { key: 'ArrowUp' });
		await fireEvent.keyDown(subjects(), { key: 'Escape' });
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(control()).toHaveFocus();
	});

	it('puts the search, the subjects and what is in one in the tab order, and names every row', async () => {
		render(Composer, { props: base({ collections: [...GROUPED, ...MANY] }) });
		await fireEvent.click(control());
		expect(screen.getByRole('combobox')).toHaveFocus();
		expect(subjects()).toHaveAttribute('tabindex', '0');
		expect(contents('Pay and conditions')).toHaveAttribute('tabindex', '0');
		for (const row of screen.getAllByRole('option')) {
			expect(row.getAttribute('aria-label')?.trim()).toBeTruthy();
		}
	});
});

describe('Composer collection picker, names in full', () => {
	const LONG = 'Defence Aviation Safety Design Requirements Manual and its airworthiness determinations';
	const COLLS = [
		{ name: 'dasdrm', title: LONG, group: { name: 'air', title: 'Airworthiness' } },
		{ name: 'other', title: 'Other', group: { name: 'air', title: 'Airworthiness' } }
	];

	it('reads a long name to its last word on the row, the pane and the chip', async () => {
		const { unmount } = render(Composer, { props: base({ collections: COLLS }) });
		await fireEvent.click(control());
		const row = screen.getByRole('option', { name: LONG });
		expect(row.textContent).toContain(LONG);
		unmount();

		render(Composer, { props: base({ collections: COLLS, collection: 'dasdrm' }) });
		expect(control()).toHaveTextContent(LONG);
	});

	it('has no truncation anywhere in the picker', () => {
		const source = readFileSync(
			join(process.cwd(), 'src/lib/components/composer/scope-picker.svelte'),
			'utf8'
		);
		expect(source).not.toMatch(/text-overflow|line-clamp|\btruncate\b|ellipsis|nowrap/);
	});
});

describe('Composer collection picker, in the top layer', () => {
	const real = HTMLElement.prototype.showPopover;
	afterEach(() => {
		HTMLElement.prototype.showPopover = real;
	});

	it('draws the popover in the top layer, on an opaque surface, so nothing the page paints covers it', async () => {
		const shown: string[] = [];
		HTMLElement.prototype.showPopover = function (this: HTMLElement) {
			shown.push(this.getAttribute('role') ?? this.className);
		};
		render(Composer, { props: base({ collections: GROUPED }) });
		await fireEvent.click(control());
		const dialog = screen.getByRole('dialog', { hidden: true });
		expect(dialog).toHaveAttribute('popover', 'manual');
		expect(shown).toContain('dialog');
		const source = readFileSync(
			join(process.cwd(), 'src/lib/components/composer/scope-picker.svelte'),
			'utf8'
		);
		expect(source).toMatch(/\.ds-lib-scope-pop \{[^}]*background: var\(--popover, var\(--ds-color-surface-3\)\)/);
		expect(source).not.toMatch(/z-index|document\.body\.appendChild/);
	});
});

describe('Composer collection picker, on a phone', () => {
	const real = window.matchMedia;
	const realShow = HTMLElement.prototype.showPopover;
	afterEach(() => {
		window.matchMedia = real;
		HTMLElement.prototype.showPopover = realShow;
	});
	function phone() {
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: /max-width/.test(query),
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn()
		}));
	}

	it('puts its sheet and scrim in the top layer', async () => {
		phone();
		HTMLElement.prototype.showPopover = () => {};
		render(Composer, { props: base({ collections: GROUPED }) });
		await fireEvent.click(control());
		expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('popover', 'manual');
		expect(document.querySelector('.ds-lib-scope-scrim')).toHaveAttribute('popover', 'manual');
	});

	it('shows the subjects first, then a tap goes into one under a back control with its name', async () => {
		phone();
		const oncollection = vi.fn();
		render(Composer, { props: base({ collections: GROUPED, oncollection }) });
		await fireEvent.click(control());
		expect(screen.getByRole('listbox', { name: 'Subjects' })).toBeInTheDocument();
		expect(screen.queryByRole('listbox', { name: 'Pay and conditions' })).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('option', { name: /^Pay and conditions/ }));
		expect(screen.queryByRole('listbox', { name: 'Subjects' })).not.toBeInTheDocument();
		const back = screen.getByRole('button', { name: 'Back to subjects from Pay and conditions' });
		expect(back).toHaveTextContent('Pay and conditions');
		expect(oncollection).not.toHaveBeenCalled();

		await fireEvent.click(back);
		expect(screen.getByRole('listbox', { name: 'Subjects' })).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('option', { name: /^Pay and conditions/ }));
		await fireEvent.click(screen.getByRole('option', { name: 'Leave' }));
		expect(oncollection).toHaveBeenLastCalledWith('leave');
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
