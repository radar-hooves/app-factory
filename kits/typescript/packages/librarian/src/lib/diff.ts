/**
 * What a version changed, read off the rendered document: each block of the
 * new one that the old one has no block of the same text for is marked
 * `data-changed`, for a bar beside it. A block is a top-level paragraph,
 * heading, quote or code block, a list item, or a table row.
 */

function blocksOf(body: Element): Element[] {
	const blocks: Element[] = [];
	for (const el of body.children) {
		if (el.tagName === 'UL' || el.tagName === 'OL') blocks.push(...el.querySelectorAll(':scope > li'));
		else if (el.tagName === 'TABLE') blocks.push(...el.querySelectorAll('tr'));
		else blocks.push(el);
	}
	return blocks;
}

const textOf = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Mark each block of `now` that `before` has no block of the same text for, on the DOM `render` sanitised. */
export function markChanges(now: Element, before: Element): void {
	const held = new Map<string, number>();
	for (const block of blocksOf(before)) {
		const text = textOf(block);
		held.set(text, (held.get(text) ?? 0) + 1);
	}
	for (const block of blocksOf(now)) {
		const text = textOf(block);
		if (!text) continue;
		const left = held.get(text) ?? 0;
		if (left > 0) held.set(text, left - 1);
		else block.setAttribute('data-changed', '');
	}
}
