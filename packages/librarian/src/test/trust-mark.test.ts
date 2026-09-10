/**
 * How current a source is, in words.
 *
 * The claims worth pinning are the three the wire can produce — a date, an
 * explicit null, and a citation with no catalogue behind it at all — plus the
 * date's own rendering, which must not move with the reader's timezone.
 */
import { describe, it, expect } from 'vitest';
import { formatVerified, trustMark, type Citation } from '$lib/citations';
import { DEFAULT_COPY, resolveCopy } from '$lib/copy';

const cited = (over: Partial<Citation> = {}): Citation => ({
	n: 1,
	document_id: '412',
	title: 'PACMAN Division 2',
	...over
});

describe('formatVerified()', () => {
	it('reads a catalogue date as a day a person would say', () => {
		expect(formatVerified('2026-06-23')).toBe('23 Jun 2026');
	});

	it('drops the leading zero from the day, and keeps the year whole', () => {
		expect(formatVerified('2026-01-05')).toBe('5 Jan 2026');
	});

	it('takes the date off a full timestamp without shifting it', () => {
		// The library sends a date; a deployment that starts sending a
		// timestamp must not silently move the mark a day either way.
		expect(formatVerified('2026-12-31T23:30:00+10:00')).toBe('31 Dec 2026');
	});

	it('is nothing at all when the value is not a date', () => {
		expect(formatVerified('recently')).toBeNull();
		expect(formatVerified('')).toBeNull();
		expect(formatVerified('2026-13-01')).toBeNull();
	});

	it('refuses a day that month never had', () => {
		expect(formatVerified('2026-04-31')).toBeNull();
		expect(formatVerified('2026-02-30')).toBeNull();
		// 2026 is not a leap year, and 2028 is.
		expect(formatVerified('2026-02-29')).toBeNull();
		expect(formatVerified('2028-02-29')).toBe('29 Feb 2028');
	});
});

describe('trustMark()', () => {
	it('says when the source was last confirmed', () => {
		expect(trustMark(cited({ verified_at: '2026-06-23' }), DEFAULT_COPY)).toBe('verified 23 Jun 2026');
	});

	it('says plainly that nothing has confirmed it', () => {
		expect(trustMark(cited({ verified_at: null }), DEFAULT_COPY)).toBe('not verified');
		expect(trustMark(cited(), DEFAULT_COPY)).toBe('not verified');
	});

	it('treats a date it cannot read as no date rather than printing it', () => {
		expect(trustMark(cited({ verified_at: 'last Tuesday' }), DEFAULT_COPY)).toBe('not verified');
	});

	it('marks a citation DERIVED from the prose not at all', () => {
		// There is no catalogued document behind one, so "not verified" would
		// be a claim about a record nothing here ever read.
		expect(trustMark(cited({ derived: true, document_id: '' }), DEFAULT_COPY)).toBeNull();
		expect(trustMark(cited({ derived: true, verified_at: '2026-06-23' }), DEFAULT_COPY)).toBeNull();
	});

	it("speaks the host's words when the host supplied any", () => {
		const words = resolveCopy({ verified: 'checked', notVerified: 'not checked' });
		expect(trustMark(cited({ verified_at: '2026-06-23' }), words)).toBe('checked 23 Jun 2026');
		expect(trustMark(cited({ verified_at: null }), words)).toBe('not checked');
	});
});

describe('resolveCopy()', () => {
	it("is the package's own words when a host overrides nothing", () => {
		expect(resolveCopy()).toEqual(DEFAULT_COPY);
		expect(resolveCopy({})).toEqual(DEFAULT_COPY);
	});

	it('takes one override without the host restating the rest', () => {
		const words = resolveCopy({ sources: 'Where this came from' });
		expect(words.sources).toBe('Where this came from');
		expect(words.askAgain).toBe(DEFAULT_COPY.askAgain);
	});

	it('ignores a key a host passed as undefined', () => {
		// The shape a host produces by computing a value from state that has
		// not loaded yet — spreading it would leave a component rendering
		// nothing where a word belongs.
		expect(resolveCopy({ sources: undefined }).sources).toBe('Sources');
	});
});
