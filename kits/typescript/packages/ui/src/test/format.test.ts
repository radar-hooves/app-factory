/**
 * The shared Australian value formatters.
 *
 * The corpus starts from godswood's `formatters.test.ts` — the only one of the
 * two hand-rolled implementations that had tests — and adds the cases only
 * pebblestone's covered: integer cents, `DD/MM/YYYY`, a date-and-time, the
 * naive-UTC timestamp trap, and the ratio-versus-points percentage split that
 * the two apps had resolved in opposite directions under nearly the same name.
 *
 * Every date assertion here is an EXACT string. It can be, because the
 * formatters pin `Australia/Brisbane` rather than reading the machine's zone —
 * godswood's own tests had to assert `toMatch(/19/)` precisely because they
 * could not. A CI runner on UTC and a laptop on AEST now agree.
 */
import { describe, it, expect } from 'vitest';
import {
	AU_TIME_ZONE,
	compactCurrency,
	dollarsToCents,
	formatCurrency,
	formatCurrencyFromCents,
	formatCurrencyString,
	formatDate,
	formatDateTime,
	formatNumber,
	formatPercentage,
	formatRatioAsPercentage,
	isNegativeMoney,
	parseApiDate
} from '$lib/format';

describe('formatCurrency', () => {
	it('renders cents by default rather than rounding them away', () => {
		expect(formatCurrency(1234.56)).toBe('$1,234.56');
	});

	it('drops to whole dollars when asked', () => {
		expect(formatCurrency(1234.56, { decimals: 0 })).toBe('$1,235');
	});

	it('formats a string value', () => {
		expect(formatCurrency('1234.56')).toBe('$1,234.56');
	});

	it('brackets a negative when asked, and leaves a positive or zero plain', () => {
		expect(formatCurrency(-1234.5, { negative: 'brackets' })).toBe('($1,234.50)');
		expect(formatCurrency('-80', { negative: 'brackets', decimals: 0 })).toBe('($80)');
		expect(formatCurrency(12, { negative: 'brackets' })).toBe('$12.00');
		expect(formatCurrency(0, { negative: 'brackets' })).toBe('$0.00');
		// A negative that rounds to nothing is not money out.
		expect(formatCurrency(-0.004, { negative: 'brackets' })).toBe('$0.00');
		expect(formatCurrency(-0.4, { negative: 'brackets', decimals: 0 })).toBe('$0');
		expect(formatCurrency(-0.005, { negative: 'brackets' })).toBe('($0.01)');
	});

	it('takes a locale for its digits and separators', () => {
		expect(formatCurrency(-1234.5, { locale: 'de-DE', negative: 'brackets' })).toMatch(
			/^\(1\.234,50\s?AU\$\)$/
		);
	});

	it('returns the fallback for null and undefined', () => {
		expect(formatCurrency(null)).toBe('N/A');
		expect(formatCurrency(undefined)).toBe('N/A');
	});

	it('returns a custom fallback', () => {
		expect(formatCurrency(null, { fallback: '-' })).toBe('-');
	});

	it('returns the fallback for a non-numeric string', () => {
		expect(formatCurrency('abc')).toBe('N/A');
	});

	it('returns the fallback for a partially numeric string', () => {
		// `parseFloat('12abc')` is 12, which renders corrupt data as a plausible
		// figure. Both hand-rolled implementations did this.
		expect(formatCurrency('12abc')).toBe('N/A');
		expect(formatCurrency('1,234.56')).toBe('N/A');
	});

	it('returns the fallback for an empty or whitespace string', () => {
		expect(formatCurrency('')).toBe('N/A');
		expect(formatCurrency('   ')).toBe('N/A');
	});

	it('returns the fallback for a non-finite number', () => {
		expect(formatCurrency(Number.NaN)).toBe('N/A');
		expect(formatCurrency(Number.POSITIVE_INFINITY)).toBe('N/A');
	});

	it('handles zero', () => {
		expect(formatCurrency(0, { decimals: 0 })).toBe('$0');
		expect(formatCurrency(0)).toBe('$0.00');
	});

	it('puts a negative sign outside the symbol', () => {
		expect(formatCurrency(-500, { decimals: 0 })).toBe('-$500');
		expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
	});

	it('disambiguates a non-AUD currency instead of showing another bare $', () => {
		const aud = formatCurrency(1234.56);
		const usd = formatCurrency(1234.56, { currency: 'USD' });
		expect(aud).toBe('$1,234.56');
		expect(usd).not.toBe(aud);
		// ICU spells this `USD 1,234.56` or `US$1,234.56` depending on version;
		// what must hold is that it is not mistakable for the AUD rendering.
		expect(usd).toMatch(/US/);
		expect(usd).toContain('1,234.56');
	});
});

describe('formatCurrencyFromCents', () => {
	it('renders integer cents as dollars', () => {
		expect(formatCurrencyFromCents(123456)).toBe('$1,234.56');
		expect(formatCurrencyFromCents(0)).toBe('$0.00');
		expect(formatCurrencyFromCents(5)).toBe('$0.05');
	});

	it('groups thousands — a six-figure total read as seven without them', () => {
		expect(formatCurrencyFromCents(12345678)).toBe('$123,456.78');
	});

	it('rounds to whole dollars when asked', () => {
		expect(formatCurrencyFromCents(123456, { decimals: 0 })).toBe('$1,235');
	});

	it('puts a negative sign outside the symbol', () => {
		expect(formatCurrencyFromCents(-123400)).toBe('-$1,234.00');
		expect(formatCurrencyFromCents(-123456, { decimals: 0 })).toBe('-$1,235');
	});

	it('returns the fallback for nullish and non-finite input', () => {
		expect(formatCurrencyFromCents(null)).toBe('N/A');
		expect(formatCurrencyFromCents(undefined)).toBe('N/A');
		expect(formatCurrencyFromCents(null, { fallback: '-' })).toBe('-');
		expect(formatCurrencyFromCents(Number.NaN)).toBe('N/A');
	});
});

describe('dollarsToCents', () => {
	it('converts to whole cents without float drift', () => {
		expect(dollarsToCents(1234.56)).toBe(123456);
		expect(dollarsToCents(0.1 + 0.2)).toBe(30);
		expect(dollarsToCents(-12.34)).toBe(-1234);
	});
});

describe('compactCurrency', () => {
	it('abbreviates millions and thousands', () => {
		expect(compactCurrency(1_109_057.64)).toBe('$1.1m');
		expect(compactCurrency(12_400)).toBe('$12k');
		expect(compactCurrency(940)).toBe('$940');
	});

	it('keeps the sign outside the symbol', () => {
		// The lifted implementation rendered `A$-1.5m`; the house rule is that a
		// negative carries its sign before the symbol, as every other money
		// formatter here does.
		expect(compactCurrency(-1_500_000)).toBe('-$1.5m');
		expect(compactCurrency(-12_400)).toBe('-$12k');
	});

	it('uses the same currency prefix as the full formatter', () => {
		expect(compactCurrency(1_000_000)).toBe('$1.0m');
		expect(compactCurrency(1_000_000, { currency: 'USD' })).toMatch(/^US.*1\.0m$/);
	});

	it('returns the fallback for nullish and non-finite input', () => {
		expect(compactCurrency(null)).toBe('N/A');
		expect(compactCurrency(undefined, { fallback: '-' })).toBe('-');
		expect(compactCurrency(Number.NaN)).toBe('N/A');
	});
});

describe('formatCurrencyString', () => {
	it('groups thousands and preserves cents without parsing to a number', () => {
		expect(formatCurrencyString('1234.56')).toBe('$1,234.56');
		expect(formatCurrencyString('1234567.89')).toBe('$1,234,567.89');
	});

	it('preserves the sign of a negative figure (never flips it positive)', () => {
		expect(formatCurrencyString('-69559.59')).toBe('-$69,559.59');
		expect(formatCurrencyString('-0.50')).toBe('-$0.50');
	});

	it('keeps a nine-figure total exact — the reason it never parses to float', () => {
		expect(formatCurrencyString('123456789.99')).toBe('$123,456,789.99');
	});

	it('keeps digits a float would have lost entirely', () => {
		// 9007199254740993.01 is past 2^53: any parse to a JS number changes it.
		expect(formatCurrencyString('9007199254740993.01')).toBe('$9,007,199,254,740,993.01');
	});

	it('preserves the exact fractional digits supplied', () => {
		expect(formatCurrencyString('1.5')).toBe('$1.5');
		expect(formatCurrencyString('1.25')).toBe('$1.25');
	});

	it('handles zero and bare integers', () => {
		expect(formatCurrencyString('0')).toBe('$0');
		expect(formatCurrencyString('0.00')).toBe('$0.00');
	});

	it('falls back for null, undefined and empty', () => {
		expect(formatCurrencyString(null)).toBe('N/A');
		expect(formatCurrencyString(undefined)).toBe('N/A');
		expect(formatCurrencyString('')).toBe('N/A');
		expect(formatCurrencyString('', { fallback: '-' })).toBe('-');
	});
});

describe('isNegativeMoney', () => {
	it('is true for a leading minus and false otherwise', () => {
		expect(isNegativeMoney('-500.00')).toBe(true);
		expect(isNegativeMoney('500.00')).toBe(false);
		expect(isNegativeMoney('0')).toBe(false);
		expect(isNegativeMoney(null)).toBe(false);
		expect(isNegativeMoney(undefined)).toBe(false);
	});

	it('treats whitespace-padded negatives as negative', () => {
		expect(isNegativeMoney('  -1.00')).toBe(true);
	});

	it('reads a number without going through a string', () => {
		expect(isNegativeMoney(-1)).toBe(true);
		expect(isNegativeMoney(0)).toBe(false);
		expect(isNegativeMoney(1)).toBe(false);
	});
});

describe('formatNumber', () => {
	it('formats a number with thousands separators', () => {
		expect(formatNumber(1234567)).toBe('1,234,567');
	});

	it('formats with decimals', () => {
		expect(formatNumber(1234.567, { decimals: 2 })).toBe('1,234.57');
	});

	it('rounds to whole numbers by default', () => {
		expect(formatNumber(1234.56)).toBe('1,235');
	});

	it('formats a string value', () => {
		expect(formatNumber('1234567')).toBe('1,234,567');
	});

	it('returns the fallback for nullish and non-numeric input', () => {
		expect(formatNumber(null)).toBe('N/A');
		expect(formatNumber(undefined)).toBe('N/A');
		expect(formatNumber('abc')).toBe('N/A');
		expect(formatNumber(null, { fallback: '-' })).toBe('-');
	});

	it('handles zero', () => {
		expect(formatNumber(0)).toBe('0');
	});
});

describe('formatPercentage', () => {
	it('treats the value as percentage points', () => {
		expect(formatPercentage(4.5)).toBe('4.5%');
		expect(formatPercentage(100)).toBe('100.0%');
	});

	it('formats with custom decimals', () => {
		expect(formatPercentage(4.5, { decimals: 2 })).toBe('4.50%');
		expect(formatPercentage(4.5, { decimals: 0 })).toBe('5%');
	});

	it('formats a string value', () => {
		expect(formatPercentage('4.5')).toBe('4.5%');
	});

	it('returns the fallback for nullish, empty and non-numeric input', () => {
		expect(formatPercentage(null)).toBe('N/A');
		expect(formatPercentage(undefined)).toBe('N/A');
		expect(formatPercentage('')).toBe('N/A');
		expect(formatPercentage('abc')).toBe('N/A');
		expect(formatPercentage(null, { fallback: '-' })).toBe('-');
	});

	it('handles zero and negatives', () => {
		expect(formatPercentage(0)).toBe('0.0%');
		expect(formatPercentage(-2.25, { decimals: 2 })).toBe('-2.25%');
	});
});

describe('formatRatioAsPercentage', () => {
	it('treats the value as a 0-1 ratio', () => {
		expect(formatRatioAsPercentage(0.0825)).toBe('8.3%');
		expect(formatRatioAsPercentage(0.045)).toBe('4.5%');
		expect(formatRatioAsPercentage(1)).toBe('100.0%');
	});

	it('is deliberately 100x apart from formatPercentage on the same input', () => {
		// The whole reason the two carry different names.
		expect(formatPercentage(0.045)).toBe('0.0%');
		expect(formatRatioAsPercentage(0.045)).toBe('4.5%');
	});

	it('accepts a Decimal serialised as a string', () => {
		expect(formatRatioAsPercentage('0.0825')).toBe('8.3%');
	});

	it('returns the fallback for nullish, empty and non-numeric input', () => {
		expect(formatRatioAsPercentage(null)).toBe('N/A');
		expect(formatRatioAsPercentage(undefined)).toBe('N/A');
		expect(formatRatioAsPercentage('')).toBe('N/A');
		expect(formatRatioAsPercentage('abc')).toBe('N/A');
		expect(formatRatioAsPercentage(null, { fallback: '-' })).toBe('-');
	});
});

describe('parseApiDate', () => {
	it('reads an offset-less timestamp as UTC, not as local time', () => {
		// The trap: a backend storing naive UTC serialises `2024-12-19T04:05:00`,
		// which JS would otherwise read as 4:05am Brisbane — ten hours early.
		expect(parseApiDate('2024-12-19T04:05:00').toISOString()).toBe('2024-12-19T04:05:00.000Z');
	});

	it('leaves a timestamp that already carries an offset alone', () => {
		expect(parseApiDate('2024-12-19T04:05:00Z').toISOString()).toBe('2024-12-19T04:05:00.000Z');
		expect(parseApiDate('2024-12-19T14:05:00+10:00').toISOString()).toBe(
			'2024-12-19T04:05:00.000Z'
		);
	});

	it('does not append a Z to a date-only value (which would be an Invalid Date)', () => {
		expect(Number.isNaN(parseApiDate('2024-12-19').getTime())).toBe(false);
	});
});

describe('formatDate', () => {
	it('renders a date-only value in the three sanctioned shapes', () => {
		expect(formatDate('2024-12-19')).toBe('19 Dec 2024');
		expect(formatDate('2024-12-19', { format: 'long' })).toBe('19 December 2024');
		expect(formatDate('2024-12-19', { format: 'numeric' })).toBe('19/12/2024');
	});

	it('renders a date-only value as the day it names, with no zone conversion', () => {
		// A date is not an instant. Converting one is how a booking dated the 1st
		// shows as the 31st.
		expect(formatDate('2024-01-01', { format: 'numeric' })).toBe('01/01/2024');
		expect(formatDate('2024-01-01', { format: 'numeric', timeZone: 'America/Chicago' })).toBe(
			'01/01/2024'
		);
	});

	it('forces a three-letter month, which en-AU does not do on its own', () => {
		// Intl en-AU returns June, July and Sept — four characters, so a date
		// column stops aligning.
		expect(formatDate('2024-06-15')).toBe('15 Jun 2024');
		expect(formatDate('2024-07-15')).toBe('15 Jul 2024');
		expect(formatDate('2024-09-15')).toBe('15 Sep 2024');
	});

	it('zero-pads the day', () => {
		expect(formatDate('2024-03-05')).toBe('05 Mar 2024');
		expect(formatDate('2024-03-05', { format: 'numeric' })).toBe('05/03/2024');
	});

	it('reads an offset-less timestamp as UTC and renders it in Brisbane', () => {
		// 2pm UTC is the next day in Brisbane: the exact case where reading the
		// string as local time gets the DAY wrong, not merely the hour.
		expect(formatDate('2024-12-19T14:30:00')).toBe('20 Dec 2024');
		expect(formatDate('2024-12-19T04:30:00')).toBe('19 Dec 2024');
	});

	it('renders in the requested zone when one is given', () => {
		expect(formatDate('2024-12-19T14:30:00Z', { timeZone: 'UTC' })).toBe('19 Dec 2024');
		expect(formatDate('2024-12-19T14:30:00Z', { timeZone: AU_TIME_ZONE })).toBe('20 Dec 2024');
	});

	it('handles Date objects', () => {
		expect(formatDate(new Date('2024-06-15T02:00:00Z'))).toBe('15 Jun 2024');
	});

	it('returns the fallback for nullish and empty input', () => {
		expect(formatDate(null)).toBe('N/A');
		expect(formatDate(undefined)).toBe('N/A');
		expect(formatDate('')).toBe('N/A');
		expect(formatDate(null, { fallback: '-' })).toBe('-');
		expect(formatDate(new Date('nonsense'))).toBe('N/A');
	});

	it('returns an unparseable string unchanged rather than hiding it', () => {
		expect(formatDate('not a date')).toBe('not a date');
		expect(formatDate('2024-13-45')).toBe('2024-13-45');
	});
});

describe('formatDateTime', () => {
	it('renders a date and a 24-hour time', () => {
		expect(formatDateTime('2024-12-19T04:05:00')).toBe('19 Dec 2024, 14:05');
		expect(formatDateTime('2024-12-19T04:05:00', { format: 'numeric' })).toBe('19/12/2024, 14:05');
	});

	it('zero-pads midnight rather than calling it 24:00', () => {
		expect(formatDateTime('2024-12-19T14:00:00Z', { format: 'numeric' })).toBe('20/12/2024, 00:00');
	});

	it('respects an explicit zone', () => {
		expect(formatDateTime('2024-12-19T04:05:00Z', { timeZone: 'UTC' })).toBe('19 Dec 2024, 04:05');
	});

	it('handles Date objects', () => {
		expect(formatDateTime(new Date('2024-12-19T04:05:00Z'))).toBe('19 Dec 2024, 14:05');
	});

	it('returns the fallback for nullish and empty input', () => {
		expect(formatDateTime(null)).toBe('N/A');
		expect(formatDateTime(undefined)).toBe('N/A');
		expect(formatDateTime('')).toBe('N/A');
		expect(formatDateTime(null, { fallback: '-' })).toBe('-');
	});

	it('returns an unparseable string unchanged', () => {
		expect(formatDateTime('not a date')).toBe('not a date');
	});
});
