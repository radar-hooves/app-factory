/** Rendered agent content fetches nothing from outside the origin. */
import { describe, it, expect } from 'vitest';
import { render, highlight } from '$lib/components/markdown/markdown';

const DATA = 'data:image/png;base64,iVBORw0KGgo=';

describe('markdown subresources', () => {
	it('degrades a remote Markdown image to its alt text', () => {
		const html = render('![chart](https://evil.example/x.png?d=1)');
		expect(html).not.toContain('<img');
		expect(html).not.toContain('evil.example');
		expect(html).toContain('chart');
	});

	it('degrades an alt-less remote image to a link', () => {
		const html = render('<img src="https://evil.example/a">');
		expect(html).not.toContain('<img');
		expect(html).toContain('<a href="https://evil.example/a">');
	});

	it('drops a style attribute and srcset', () => {
		const html = render(
			'<p style="background:url(https://evil.example/b)">hi</p><img srcset="https://evil.example/c 2x" src="/a.png">'
		);
		expect(html).not.toContain('evil.example');
		expect(html).not.toContain('style=');
		expect(html).toContain('hi');
	});

	it('drops other fetching elements', () => {
		const html = render(
			'<video src="https://evil.example/v"></video><iframe src="https://evil.example/f"></iframe><svg><image href="https://evil.example/i"/></svg><p>kept</p>'
		);
		expect(html).not.toContain('evil.example');
		expect(html).toContain('kept');
	});

	it('keeps a same-origin and a data image', () => {
		expect(render('![ok](/api/agent/x.png)')).toContain('<img src="/api/agent/x.png"');
		expect(render(`![d](${DATA})`)).toContain('<img src="data:image/png');
		expect(render('![p](//evil.example/x.png)')).not.toContain('<img');
	});

	it('keeps links', () => {
		expect(render('[x](https://example.com/)')).toContain('href="https://example.com/"');
	});

	it('still highlights a code block', async () => {
		const root = document.createElement('div');
		root.innerHTML = render('```python\nprint(1)\n```');
		await highlight(root);
		expect(root.querySelector('pre[data-highlighted="true"]')).not.toBeNull();
		expect(root.querySelector('pre span[style]')).not.toBeNull();
	});
});
