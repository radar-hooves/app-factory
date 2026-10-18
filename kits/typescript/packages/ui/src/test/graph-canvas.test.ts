import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import Probe from './graph-canvas.svelte';

const root = () => document.querySelector<HTMLElement>('[data-slot=graph-canvas]')!;
const find = () => screen.getByLabelText('Find in Relations') as HTMLInputElement;
const legend = () => within(screen.getByRole('list', { name: 'Kinds' }));
const card = () => screen.queryByRole('region', { name: 'Mara Quinn' });
const selectedOut = () => screen.getByTestId('selected').textContent;
const hiddenOut = () => screen.getByTestId('hidden').textContent;

async function findAndPick(text: string) {
	await fireEvent.input(find(), { target: { value: text } });
	await fireEvent.keyDown(find(), { key: 'Enter' });
}

describe('GraphCanvas', () => {
	const uncaught = vi.fn();

	beforeEach(() => {
		// jsdom has no 2D context; the component must run without one.
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
		window.addEventListener('error', uncaught);
	});
	afterEach(() => {
		window.removeEventListener('error', uncaught);
		expect(uncaught).not.toHaveBeenCalled();
		uncaught.mockReset();
		vi.restoreAllMocks();
	});

	it('lists each kind with its count in kinds order, then an unlisted kind by its id', () => {
		render(Probe);
		const rows = legend().getAllByRole('button');
		expect(rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'People 2',
			'Organisations 2',
			'Sources 2',
			'note 1'
		]);
	});

	it('toggles a kind from its legend row, into aria-pressed and the bound hiddenKinds', async () => {
		render(Probe);
		const people = legend().getByRole('button', { name: /People/ });
		expect(people).toHaveAttribute('aria-pressed', 'true');
		await fireEvent.click(people);
		expect(people).toHaveAttribute('aria-pressed', 'false');
		expect(hiddenOut()).toBe('person');
		await fireEvent.click(legend().getByRole('button', { name: /note/ }));
		expect(hiddenOut()).toBe('person,note');
		await fireEvent.click(people);
		expect(people).toHaveAttribute('aria-pressed', 'true');
		expect(hiddenOut()).toBe('note');
	});

	it('lists matches earliest position first, and Enter selects the first', async () => {
		const onselect = vi.fn();
		render(Probe, { onselect });
		await fireEvent.input(find(), { target: { value: 'mar' } });
		const matches = within(screen.getByRole('list', { name: 'Matches' })).getAllByRole('button');
		expect(matches.map((m) => m.textContent)).toEqual([
			expect.stringContaining('Mara Quinn'),
			expect.stringContaining('Marlow Trust'),
			expect.stringContaining('Alice Marlow')
		]);
		await fireEvent.keyDown(find(), { key: 'Enter' });
		expect(onselect).toHaveBeenCalledTimes(1);
		expect(onselect).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-mara' }));
		expect(screen.getByRole('heading', { name: 'Mara Quinn' })).toBeInTheDocument();
		expect(root()).toHaveAttribute('data-selected', 'p-mara');
		expect(selectedOut()).toBe('p-mara');
		expect(find().value).toBe('');
	});

	it('says "No match" for a query that finds nothing', async () => {
		render(Probe);
		await fireEvent.input(find(), { target: { value: 'zzz' } });
		expect(screen.getByText('No match')).toBeInTheDocument();
	});

	it('groups connections under direction-phrased headings', async () => {
		render(Probe);
		await findAndPick('mara');
		const c = within(card()!);
		expect(c.getByText('Director of', { exact: true })).toBeInTheDocument();
		expect(c.getByText('Mentions this', { exact: true })).toBeInTheDocument();
		expect(c.queryByText('Mentions', { exact: true })).not.toBeInTheDocument();
		expect(c.getByText('2 connections')).toBeInTheDocument();
		const headings = c.getAllByText(/^(Director of|Mentions this)$/).map((h) => h.textContent);
		expect(headings).toEqual(['Director of', 'Mentions this']);
	});

	it('selects a node when its connection is clicked', async () => {
		const onselect = vi.fn();
		render(Probe, { onselect });
		await findAndPick('mara');
		onselect.mockClear();
		await fireEvent.click(within(card()!).getByRole('button', { name: 'Marlow Trust' }));
		expect(onselect).toHaveBeenCalledWith(expect.objectContaining({ id: 'o-marlow' }));
		expect(selectedOut()).toBe('o-marlow');
		expect(root()).toHaveAttribute('data-selected', 'o-marlow');
		expect(screen.getByRole('heading', { name: 'Marlow Trust' })).toBeInTheDocument();
	});

	it('clears the find text on Escape first, then the selection', async () => {
		const onselect = vi.fn();
		render(Probe, { onselect });
		await findAndPick('mara');
		await fireEvent.input(find(), { target: { value: 'ali' } });
		onselect.mockClear();

		await fireEvent.keyDown(root(), { key: 'Escape' });
		expect(find().value).toBe('');
		expect(selectedOut()).toBe('p-mara');
		expect(onselect).not.toHaveBeenCalled();

		await fireEvent.keyDown(root(), { key: 'Escape' });
		expect(onselect).toHaveBeenCalledExactlyOnceWith(null);
		expect(selectedOut()).toBe('');
		expect(card()).not.toBeInTheDocument();
		expect(root()).not.toHaveAttribute('data-selected');
	});

	it('renders the detail snippet with the node and its neighbours', async () => {
		render(Probe);
		await findAndPick('mara');
		const detail = screen.getByTestId('detail');
		expect(detail.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Mara Quinn|Marlow Trust,Annual Report'
		);
	});

	it('offers the activate button only when onactivate is passed, and calls it', async () => {
		const { unmount } = render(Probe);
		await findAndPick('mara');
		expect(within(card()!).queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
		unmount();

		const onactivate = vi.fn();
		render(Probe, { onactivate, activateLabel: 'Open entity' });
		await findAndPick('mara');
		await fireEvent.click(within(card()!).getByRole('button', { name: 'Open entity' }));
		expect(onactivate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'p-mara' }));
	});

	it('shows the card for a selected set by the parent, with no click', async () => {
		const { unmount } = render(Probe, { selected: 'p-mara' });
		expect(card()).toBeInTheDocument();
		expect(root()).toHaveAttribute('data-selected', 'p-mara');
		unmount();

		render(Probe);
		expect(screen.queryByRole('region')).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Parent selects Acme' }));
		expect(screen.getByRole('region', { name: 'Acme Holdings' })).toBeInTheDocument();
		expect(root()).toHaveAttribute('data-selected', 'o-acme');
	});

	it('clears the selection when the selected node’s kind is hidden', async () => {
		const onselect = vi.fn();
		render(Probe, { selected: 'p-mara', onselect });
		await fireEvent.click(legend().getByRole('button', { name: /People/ }));
		expect(hiddenOut()).toBe('person');
		expect(onselect).toHaveBeenCalledExactlyOnceWith(null);
		expect(selectedOut()).toBe('');
		expect(card()).not.toBeInTheDocument();
	});

	it('keeps the selection when another kind is hidden', async () => {
		render(Probe, { selected: 'p-mara' });
		await fireEvent.click(legend().getByRole('button', { name: /Sources/ }));
		expect(selectedOut()).toBe('p-mara');
		expect(card()).toBeInTheDocument();
	});
});
