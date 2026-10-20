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

const embed = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('vega-embed', () => ({ default: embed }));

beforeEach(() => embed.mockClear());

const spec = {
	$schema: 'https://vega.github.io/schema/vega-lite/v5.json',
	config: { background: 'red' },
	data: { values: [{ a: 'x', b: 3 }] },
	mark: 'bar',
	encoding: { x: { field: 'a' }, y: { field: 'b' } }
};
const block = (lang: string, body: string) => `Before\n\n\`\`\`${lang}\n${body}\n\`\`\`\n\nAfter`;

describe('the default visuals', () => {
	it('are a Vega-Lite chart, a timeline and an entity card', () => {
		expect(Object.keys(defaultVisuals).sort()).toEqual(['card', 'timeline', 'vega-lite']);
	});

	it('refuse a Vega-Lite block that is not a view, or that names an address to fetch or open', () => {
		const parse = defaultVisuals['vega-lite'].parse;
		expect(parse(JSON.stringify(spec))).toMatchObject({ mark: 'bar' });
		expect(() => parse('{not json')).toThrow();
		expect(() => parse('[1]')).toThrow();
		expect(() => parse('{"data":{"values":[]}}')).toThrow();
		expect(() => parse(JSON.stringify({ ...spec, data: { url: 'https://evil.example/?q=1' } }))).toThrow();
		// vega-embed merges a spec's own embed options over the app's: a URL there is fetched.
		expect(() =>
			parse(JSON.stringify({ ...spec, usermeta: { embedOptions: { config: 'https://evil.example/c?q=1' } } }))
		).toThrow();
		expect(() => parse(JSON.stringify({ ...spec, title: '//evil.example/x' }))).toThrow();
		expect(() => parse(JSON.stringify({ ...spec, description: 'javascript:alert(1)' }))).toThrow();
		expect(() =>
			parse(JSON.stringify({ ...spec, encoding: { href: { value: 'https://evil.example' } } }))
		).toThrow();
	});

	it('refuse a timeline without events, and a card without a name', () => {
		expect(() => defaultVisuals.timeline.parse('{"title":"t"}')).toThrow();
		expect(() => defaultVisuals.timeline.parse('{"events":[{"date":"1"}]}')).toThrow();
		expect(() => defaultVisuals.card.parse('{"kind":"unit"}')).toThrow();
	});
});

describe('a persona’s block, in an answer', () => {
	it('mounts the chart for a complete vega-lite block, over the app’s tokens and not the spec’s', async () => {
		render(Markdown, {
			props: { content: block('vega-lite', JSON.stringify(spec)), visuals: defaultVisuals }
		});

		await waitFor(() => expect(embed).toHaveBeenCalledTimes(1));
		const [host, drawn, options] = embed.mock.calls[0] as unknown as [
			HTMLElement,
			Record<string, unknown>,
			{ actions: boolean; renderer: string; config: Record<string, unknown> }
		];
		expect(host).toBeInstanceOf(HTMLElement);
		expect(drawn).toMatchObject({ mark: 'bar', width: 'container' });
		expect(drawn).not.toHaveProperty('$schema');
		expect(drawn).not.toHaveProperty('config');
		expect(options).toMatchObject({ actions: false, renderer: 'svg' });
		expect(options.config).toHaveProperty('axis.labelColor');
		expect(options.config).toHaveProperty('title.font');
	});

	it('shows Drawing… while a block’s closing fence has not arrived', () => {
		const { container } = render(Markdown, {
			props: {
				content: 'Before\n\n```vega-lite\n{"mark":',
				streaming: true,
				visuals: defaultVisuals
			}
		});
		expect(screen.getByRole('status')).toHaveTextContent('Drawing…');
		expect(embed).not.toHaveBeenCalled();
		expect(container.textContent).toContain('Before');
	});

	it('shows an invalid block as its raw text in a code block, with the answer around it', () => {
		const { container } = render(Markdown, {
			props: { content: block('vega-lite', '{ not json'), visuals: defaultVisuals }
		});
		expect(embed).not.toHaveBeenCalled();
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
		expect(embed).not.toHaveBeenCalled();
	});
});

describe('splitting an answer at its visuals', () => {
	const has = (lang: string) => lang === 'vega-lite';

	it('cuts prose, a closed block, prose', () => {
		expect(splitVisuals('a\n\n```vega-lite\n{}\n```\n\nb', has)).toEqual([
			{ kind: 'md', text: 'a\n' },
			{ kind: 'visual', lang: 'vega-lite', source: '{}', closed: true },
			{ kind: 'md', text: '\nb' }
		]);
	});

	it('marks a block still open, and leaves other fences and nested ones in the prose', () => {
		expect(splitVisuals('a\n```vega-lite\n{"x"', has)).toEqual([
			{ kind: 'md', text: 'a' },
			{ kind: 'visual', lang: 'vega-lite', source: '{"x"', closed: false }
		]);
		const only = splitVisuals('```python\n```vega-lite\n```', has);
		expect(only).toHaveLength(1);
		expect(only[0].kind).toBe('md');
	});
});
