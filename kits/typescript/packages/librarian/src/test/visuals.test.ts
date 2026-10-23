/**
 * The visuals registry: a fence's language picks the renderer, a complete block
 * is drawn, a block still arriving is a placeholder, and one that is not what
 * it says is the code it was.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import Markdown from '$lib/components/markdown/markdown.svelte';
import { splitVisuals } from '$lib/components/markdown/markdown';
import { defaultVisuals } from '$lib/visuals';
import Visual from './fixtures/visual.svelte';

// LayerChart is loaded when a chart is drawn: the test stands a fixture in for the drawing component.
const drawn = vi.hoisted(() => ({ loaded: 0 }));
vi.mock('$lib/components/visual-block/chart-draw.svelte', async () => {
	drawn.loaded += 1;
	return { default: (await import('./fixtures/visual.svelte')).default };
});

beforeEach(() => (drawn.loaded = 0));

const spec = {
	title: 'Rent by year',
	type: 'bar',
	x: 'year',
	y: ['rent'],
	data: [
		{ year: '2025', rent: 3 },
		{ year: '2026', rent: 4 }
	]
};
const block = (lang: string, body: string) => `Before\n\n\`\`\`${lang}\n${body}\n\`\`\`\n\nAfter`;

describe('the default visuals', () => {
	it('are a chart, a timeline and an entity card', () => {
		expect(Object.keys(defaultVisuals).sort()).toEqual(['card', 'chart', 'timeline']);
	});

	it('refuse a chart block that is not a bar, line or area of numbers', () => {
		const parse = defaultVisuals.chart.parse;
		expect(parse(JSON.stringify(spec))).toMatchObject({ type: 'bar', x: 'year', y: ['rent'] });
		expect(parse(JSON.stringify({ ...spec, type: 'line' }))).toMatchObject({ type: 'line' });
		expect(() => parse('{not json')).toThrow();
		expect(() => parse('[1]')).toThrow();
		expect(() => parse(JSON.stringify({ ...spec, type: 'pie' }))).toThrow();
		expect(() => parse(JSON.stringify({ ...spec, y: [] }))).toThrow();
		expect(() => parse(JSON.stringify({ ...spec, y: ['a', 'b', 'c', 'd', 'e', 'f'] }))).toThrow();
		expect(() => parse(JSON.stringify({ ...spec, data: [] }))).toThrow();
		expect(() => parse(JSON.stringify({ ...spec, data: [{ year: '2025', rent: 'three' }] }))).toThrow();
		expect(() => parse(JSON.stringify({ ...spec, data: [{ rent: 3 }] }))).toThrow();
	});

	it('keep only the fields a chart draws, so a spec carries nothing else to the page', () => {
		const parsed = defaultVisuals.chart.parse(
			JSON.stringify({ ...spec, config: { background: 'red' }, data: [{ year: '2025', rent: 3, href: 'https://evil.example' }] })
		);
		expect(parsed).toEqual({ ...spec, data: [{ year: '2025', rent: 3 }] });
	});

	it('refuse a timeline without events, and a card without a name', () => {
		expect(() => defaultVisuals.timeline.parse('{"title":"t"}')).toThrow();
		expect(() => defaultVisuals.timeline.parse('{"events":[{"date":"1"}]}')).toThrow();
		expect(() => defaultVisuals.card.parse('{"kind":"unit"}')).toThrow();
	});
});

describe('a persona’s block, in an answer', () => {
	it('loads the chart only for a complete chart block, with its title', async () => {
		const plain = render(Markdown, { props: { content: 'No chart here.', visuals: defaultVisuals } });
		expect(drawn.loaded).toBe(0);
		plain.unmount();

		render(Markdown, { props: { content: block('chart', JSON.stringify(spec)), visuals: defaultVisuals } });
		expect(screen.getByText('Rent by year')).toBeInTheDocument();
		await waitFor(() => expect(screen.getByTestId('visual')).toBeInTheDocument());
		expect(drawn.loaded).toBe(1);
		expect(screen.getByTestId('visual')).toHaveTextContent('"rent":4');
	});

	it('shows Drawing… while a block’s closing fence has not arrived', () => {
		const { container } = render(Markdown, {
			props: {
				content: 'Before\n\n```chart\n{"type":',
				streaming: true,
				visuals: defaultVisuals
			}
		});
		expect(screen.getByRole('status')).toHaveTextContent('Drawing…');
		expect(drawn.loaded).toBe(0);
		expect(container.textContent).toContain('Before');
	});

	it('shows an invalid block as its raw text in a code block, with the answer around it', () => {
		const { container } = render(Markdown, {
			props: { content: block('chart', '{ not json'), visuals: defaultVisuals }
		});
		expect(drawn.loaded).toBe(0);
		expect(container.querySelector('pre code')).toHaveTextContent('{ not json');
		expect(container.textContent).toContain('Before');
		expect(container.textContent).toContain('After');
	});

	it('draws a timeline and an entity card from the same registry', () => {
		const timeline = block(
			'timeline',
			JSON.stringify({ title: 'Posting', events: [{ date: '30 Jul 2026', title: 'Rates change', detail: 'Contribution up' }] })
		);
		const card = block(
			'card',
			JSON.stringify({ name: 'PACMAN 7.8.12', kind: 'Policy', summary: 'Increased rent ceiling', facts: [{ label: 'Part', value: '7.8' }] })
		);
		const { container, unmount } = render(Markdown, { props: { content: timeline, visuals: defaultVisuals } });
		expect(screen.getByText('Posting')).toBeInTheDocument();
		expect(screen.getByText('Rates change')).toBeInTheDocument();
		expect(screen.getByText('Contribution up')).toBeInTheDocument();
		expect(container.querySelector('pre')).toBeNull();
		unmount();

		render(Markdown, { props: { content: card, visuals: defaultVisuals } });
		expect(screen.getByText('PACMAN 7.8.12')).toBeInTheDocument();
		expect(screen.getByText('Policy')).toBeInTheDocument();
		expect(screen.getByText('Part')).toBeInTheDocument();
		expect(screen.getByText('7.8')).toBeInTheDocument();
	});

	it('draws a language an app registered, over the defaults, with its own parse', () => {
		const visuals = {
			...defaultVisuals,
			openui: { component: Visual, parse: (source: string) => ({ lines: source.split('\n').length }) }
		};
		render(Markdown, { props: { content: block('openui', 'root = Stack([])\nx = 1'), visuals } });
		expect(screen.getByTestId('visual')).toHaveTextContent('{"lines":2}');

		const replaced = { ...defaultVisuals, card: { component: Visual, parse: (s: string) => s } };
		render(Markdown, { props: { content: block('card', 'plain words'), visuals: replaced } });
		expect(screen.getAllByTestId('visual').at(-1)).toHaveTextContent('"plain words"');
	});

	it('leaves a language with no renderer as an ordinary code block', () => {
		const { container } = render(Markdown, {
			props: { content: block('python', 'print(1)'), visuals: defaultVisuals }
		});
		expect(container.querySelector('code.language-python')).not.toBeNull();
		expect(drawn.loaded).toBe(0);
	});
});

describe('splitting an answer at its visuals', () => {
	const has = (lang: string) => lang === 'chart';

	it('cuts prose, a closed block, prose', () => {
		expect(splitVisuals('a\n\n```chart\n{}\n```\n\nb', has)).toEqual([
			{ kind: 'md', text: 'a\n' },
			{ kind: 'visual', lang: 'chart', source: '{}', closed: true },
			{ kind: 'md', text: '\nb' }
		]);
	});

	it('marks a block still open, and leaves other fences and nested ones in the prose', () => {
		expect(splitVisuals('a\n```chart\n{"x"', has)).toEqual([
			{ kind: 'md', text: 'a' },
			{ kind: 'visual', lang: 'chart', source: '{"x"', closed: false }
		]);
		const only = splitVisuals('```python\n```chart\n```', has);
		expect(only).toHaveLength(1);
		expect(only[0].kind).toBe('md');
	});
});
