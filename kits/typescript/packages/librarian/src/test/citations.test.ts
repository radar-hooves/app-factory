/**
 * Two shapes of the same thing: the wire event the library is adding, and the
 * "## Sources" block the prose carries until it ships everywhere.
 */
import { describe, it, expect } from 'vitest';
import {
	citationMarkers,
	resolveCitations,
	splitSources,
	type Citation
} from '$lib/citations';

describe('citationMarkers()', () => {
	it('finds inline markers in order, once each', () => {
		expect(citationMarkers('Leave accrues [1] at the rate set out [2], see [1] again.')).toEqual([
			1, 2
		]);
	});

	it('is not fooled by a markdown link or a link definition', () => {
		expect(citationMarkers('See [1](https://example.com) and [2]: https://example.com')).toEqual([]);
	});

	it('finds BOTH of two adjacent markers, which is how one claim cites two sources', () => {
		expect(citationMarkers('The rate has not changed [1][2].')).toEqual([1, 2]);
	});

	it('finds nothing in prose that cites nothing', () => {
		expect(citationMarkers('Recreation leave is 20 days a year.')).toEqual([]);
	});
});

describe('splitSources()', () => {
	it('lifts a trailing Sources block off the prose', () => {
		const answer = [
			'Recreation leave is 20 days a year [1].',
			'',
			'## Sources',
			'',
			'1. **PACMAN Division 2** — Part 5, recreation leave',
			'2. PACMAN Division 1 – Part 1'
		].join('\n');

		const { body, citations } = splitSources(answer);

		expect(body).toBe('Recreation leave is 20 days a year [1].');
		expect(citations).toHaveLength(2);
		expect(citations[0]).toMatchObject({
			n: 1,
			title: 'PACMAN Division 2',
			section: 'Part 5, recreation leave',
			derived: true,
			document_id: ''
		});
		expect(citations[1]).toMatchObject({ n: 2, title: 'PACMAN Division 1', section: 'Part 1' });
	});

	it('numbers an unnumbered bullet list by position', () => {
		const { citations } = splitSources('Answer.\n\n## Sources\n\n- Air 6015 program brief\n- ACP domain paper');
		expect(citations.map((c) => c.n)).toEqual([1, 2]);
		expect(citations[0].title).toBe('Air 6015 program brief');
		expect(citations[0].section).toBeUndefined();
	});

	it('leaves the prose alone when there is no Sources block', () => {
		const answer = 'Recreation leave is 20 days a year.';
		expect(splitSources(answer)).toEqual({ body: answer, citations: [] });
	});

	it('leaves a Sources heading that parses to nothing exactly where it was', () => {
		const answer = 'Answer.\n\n## Sources\n\nNothing citable here.';
		expect(splitSources(answer)).toEqual({ body: answer, citations: [] });
	});

	it('stops at the next heading rather than eating the rest of the answer', () => {
		const { body, citations } = splitSources(
			'Answer.\n\n## Sources\n\n- One document\n\n## Notes\n\n- Not a source'
		);
		expect(citations.map((c) => c.title)).toEqual(['One document']);
		// Anything Milton wrote AFTER his sources is his answer, not his sources,
		// and dropping it is the worst kind of loss: silent.
		expect(body).toBe('Answer.\n\n## Notes\n\n- Not a source');
	});
});

describe('resolveCitations()', () => {
	const wire: Citation = { n: 1, document_id: 'doc-1', title: 'PACMAN', section: 'Part 5' };
	const prose: Citation = { n: 1, document_id: '', title: 'PACMAN', derived: true };

	it('prefers the wire event, which is the same list with ids attached', () => {
		expect(resolveCitations([wire], [prose])).toEqual([wire]);
	});

	it('falls back to the prose block until that event ships', () => {
		expect(resolveCitations([], [prose])).toEqual([prose]);
	});
});
