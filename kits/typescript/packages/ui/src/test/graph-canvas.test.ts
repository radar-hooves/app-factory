import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import Probe from './graph-canvas.svelte';
import { GraphScene } from '$lib/components/ui/graph-canvas/scene.js';

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

	it('reaches every node from a keyboard-focusable list, synced with the selection', async () => {
		render(Probe);
		const toggle = screen.getByRole('button', { name: /^Nodes/ });
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await fireEvent.click(toggle);
		expect(toggle).toHaveAttribute('aria-expanded', 'true');
		const list = within(screen.getByRole('list', { name: 'Nodes' }));
		expect(list.getAllByRole('button')).toHaveLength(7);
		await fireEvent.click(list.getByRole('button', { name: /Mara Quinn/ }));
		expect(selectedOut()).toBe('p-mara');
		expect(list.getByRole('button', { name: /Mara Quinn/ })).toHaveAttribute('aria-pressed', 'true');
		expect(list.getByRole('button', { name: /Alice Marlow/ })).toHaveAttribute('aria-pressed', 'false');
	});

	it('leaves a hidden kind out of the node list', async () => {
		render(Probe);
		await fireEvent.click(legend().getByRole('button', { name: /People/ }));
		const list = within(screen.getByRole('list', { name: 'Nodes', hidden: true }));
		expect(list.queryByRole('button', { name: /Mara Quinn/, hidden: true })).not.toBeInTheDocument();
	});

	it('names the highlighted path for a screen reader, skipping unknown ids', () => {
		render(Probe, { path: ['p-mara', 'o-marlow', 'x-missing'] });
		const canvas = document.querySelector('canvas')!;
		expect(canvas.getAttribute('aria-label')).toContain('Path: Mara Quinn, then Marlow Trust.');
	});
});

describe('GraphScene route and edge style', () => {
	const nodes = ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id, kind: 'k' }));
	const edges = [
		{ source: 'a', target: 'b', label: 'supplies' },
		{ source: 'c', target: 'b', style: 'dashed' as const },
		{ source: 'c', target: 'd' }
	];

	it('lights only the edges joining consecutive path nodes, in either direction', () => {
		const scene = new GraphScene();
		scene.setData(nodes, edges);
		scene.setRoute(['a', 'b', 'c']);
		expect([...scene.routeNodes].map((n) => n.id)).toEqual(['a', 'b', 'c']);
		expect(scene.routeEdges.size).toBe(2);
		expect([...scene.routeEdges].some((e) => e.target.id === 'd')).toBe(false);
		scene.setRoute([]);
		expect(scene.routeEdges.size).toBe(0);
	});

	it('strokes dashed edges with a dash pattern and solid ones without', () => {
		const scene = new GraphScene();
		scene.setData(nodes, edges);
		scene.nodes.forEach((n, i) => ((n.x = i * 40), (n.y = 0)));
		scene.width = 400;
		scene.height = 300;
		scene.palette = { kinds: new Map(), fallback: '#888', ground: '#fff', ink: '#000', inkSoft: '#555', edge: '#999', font: 'sans-serif' };
		const dashes: number[][] = [];
		const ctx = new Proxy(
			{ setLineDash: (d: number[]) => dashes.push(d), measureText: () => ({ width: 10 }) },
			{ get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined), set: () => true }
		) as unknown as CanvasRenderingContext2D;
		vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {} rect() {} arc() {} });
		scene.draw(ctx);
		vi.unstubAllGlobals();
		expect(dashes.some((d) => d.length === 2)).toBe(true);
		expect(dashes.some((d) => d.length === 0)).toBe(true);
	});
});
