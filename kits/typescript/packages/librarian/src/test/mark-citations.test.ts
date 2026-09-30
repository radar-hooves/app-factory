/**
 * A `[3]` is a citation in prose and is NOT one inside a code block or a link
 * label — which is why the marking runs over the DOM rather than the string.
 */
import { describe, it, expect } from 'vitest';
import { markCitations, render } from '$lib/components/markdown/markdown';

function rendered(markdown: string): HTMLElement {
	const host = document.createElement('div');
	host.innerHTML = render(markdown);
	return host;
}

describe('markCitations()', () => {
	it('turns an inline marker into a keyboard-reachable chip', () => {
		const host = rendered('Leave accrues [1] each year.');
		markCitations(host, new Set([1]));

		const chip = host.querySelector('sup[data-cite]');
		expect(chip?.textContent).toBe('1');
		expect(chip?.getAttribute('role')).toBe('button');
		expect(chip?.getAttribute('tabindex')).toBe('0');
		expect(host.textContent?.trim()).toBe('Leave accrues 1 each year.');
	});

	it('leaves a marker inside a code block alone', () => {
		const host = rendered('```python\nitems[1]\n```');
		markCitations(host, new Set([1]));
		expect(host.querySelector('sup[data-cite]')).toBeNull();
	});

	it('leaves a number nothing cites as plain text', () => {
		const host = rendered('Leave accrues [7] each year.');
		markCitations(host, new Set([1]));
		expect(host.querySelector('sup[data-cite]')).toBeNull();
		expect(host.textContent).toContain('[7]');
	});

	it('marks every marker in one paragraph', () => {
		const host = rendered('First [1], then [2], then [1] again.');
		markCitations(host, new Set([1, 2]));
		expect(host.querySelectorAll('sup[data-cite]')).toHaveLength(3);
	});
});
