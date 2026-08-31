/**
 * The household's Australian value formatters.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two apps had hand-rolled the same job — `godswood/frontend/src/lib/utils/
 * formatters.ts` and `pebblestone/frontend/src/lib/utils/format.ts` — and had
 * already drifted on every decision that matters: whether a percentage arrives
 * as `4.5` or `0.045`, whether money arrives as dollars or as integer cents,
 * whether a date renders `19 Dec 2024` or `19/12/2024`, and whether a missing
 * value reads `N/A` or `-`. All four are user-visible, and the fleet is
 * entirely Australian, so the disagreement bought nothing.
 *
 * WHAT IS IN AND WHAT IS NOT
 * --------------------------
 * In: every formatter for a value class BOTH apps format — money, dates and
 * times, percentages, plain numbers — including the variants only one app has
 * today, because a value class the package owns it owns completely. Splitting
 * money across two homes is how the drift started.
 *
 * Out: formatters for a value class only ONE app has, which are a domain
 * vocabulary rather than a shared value class — loan repayment frequencies and
 * AI model IDs (godswood), file sizes (godswood), pager arithmetic and the
 * per-line GST recompute for bill approvals (pebblestone, and bound to Xero tax
 * codes besides). Relative time ("2 hours ago") is out too: it lives on
 * `date-fns` in the one app that has it, and a display formatter is not worth
 * making that a dependency of every consumer of this package.
 *
 * THE CONVENTIONS THESE ENCODE
 * ----------------------------
 * - `en-AU`, AUD, and `Australia/Brisbane` wherever a timezone is implied. The
 *   zone is pinned rather than taken from the browser: the household's books
 *   are kept in AEST, so a laptop in another zone should not renumber them.
 * - Dates render `DD Mon YYYY` or, on request, `DD/MM/YYYY` — both sanctioned
 *   Australian forms.
 * - A negative amount carries its sign OUTSIDE the symbol: `-$1,234.56`, never
 *   `$-1,234.56`.
 * - A missing value renders `N/A`, and every formatter takes a `fallback` to
 *   say otherwise. `-` is deliberately not the default: beside a money column
 *   it reads as a minus sign, which is the one wrong meaning available.
 *
 * No dependencies, no DOM: this module is `Intl` and arithmetic.
 */

/** The one locale every household app formats in. */
export const AU_LOCALE = 'en-AU';

/** The one timezone the household's records are kept in. */
export const AU_TIME_ZONE = 'Australia/Brisbane';

/** What a formatter renders when it has nothing to render. */
const FALLBACK = 'N/A';

// --------------------------------------------------------------------------- //
//  Money                                                                       //
// --------------------------------------------------------------------------- //

export interface CurrencyOptions {
	/**
	 * Fraction digits. Defaults to 2: dropping cents is a loss of fidelity the
	 * caller should have to ask for, not the default that quietly rounds
	 * $1,234.56 up to $1,235. Pass `0` for a dashboard figure.
	 */
	decimals?: number;
	/** Rendered when the value is null, undefined, empty or not a number. */
	fallback?: string;
	/**
	 * ISO 4217 code. Defaults to AUD, which renders as a bare `$`; a non-AUD
	 * currency renders disambiguated (`USD 1,234.56`) rather than as another
	 * `$`, because an app that holds a foreign account is exactly the app that
	 * must not confuse the two.
	 */
	currency?: string;
}

/**
 * Coerce an API value to a finite number, or null.
 *
 * `Number` rather than `parseFloat`, deliberately: `parseFloat('12abc')` is 12,
 * which renders corrupt data as a plausible figure. A value that is not wholly
 * numeric falls back instead.
 */
function toFiniteNumber(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	const trimmed = value.trim();
	if (trimmed === '') return null;
	const num = Number(trimmed);
	return Number.isFinite(num) ? num : null;
}

/**
 * Format a DOLLAR value as currency.
 *
 * @example
 * formatCurrency(1234.56)                      // '$1,234.56'
 * formatCurrency('1234.56', { decimals: 0 })   // '$1,235'
 * formatCurrency(-500, { decimals: 0 })        // '-$500'
 * formatCurrency(null)                         // 'N/A'
 */
export function formatCurrency(
	value: string | number | null | undefined,
	options: CurrencyOptions = {}
): string {
	const { decimals = 2, fallback = FALLBACK, currency = 'AUD' } = options;

	const num = toFiniteNumber(value);
	if (num === null) return fallback;

	return new Intl.NumberFormat(AU_LOCALE, {
		style: 'currency',
		currency,
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals
	}).format(num);
}

/**
 * Format an INTEGER-CENTS value as currency.
 *
 * Money held as integer cents is the correct storage for money, and the app
 * that does it should not have to divide by 100 at every call site and hope
 * the float lands.
 *
 * @example
 * formatCurrencyFromCents(123456)                    // '$1,234.56'
 * formatCurrencyFromCents(-123456, { decimals: 0 })  // '-$1,235'
 * formatCurrencyFromCents(null)                      // 'N/A'
 */
export function formatCurrencyFromCents(
	cents: number | null | undefined,
	options: CurrencyOptions = {}
): string {
	if (cents === null || cents === undefined || !Number.isFinite(cents)) {
		return options.fallback ?? FALLBACK;
	}
	return formatCurrency(cents / 100, options);
}

/** Convert a dollar value to whole cents. */
export function dollarsToCents(dollars: number): number {
	return Math.round(dollars * 100);
}

/**
 * The currency prefix `formatCurrency` would use — `$` for AUD, `USD ` for
 * USD — so the compact form and the full form never disagree about the symbol.
 */
function currencyPrefix(currency: string): string {
	const parts = new Intl.NumberFormat(AU_LOCALE, {
		style: 'currency',
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	}).formatToParts(0);

	let prefix = '';
	for (const part of parts) {
		if (part.type === 'integer') break;
		if (part.type === 'currency' || part.type === 'literal') prefix += part.value;
	}
	return prefix;
}

/**
 * Abbreviate a money value for a chart axis or a dense tile.
 *
 * A y-axis tick has room for four or five characters, not for `$1,109,057.64`.
 * Full precision belongs in the tooltip and the table; the axis exists to tell
 * the reader which order of magnitude they are looking at.
 *
 * @example
 * compactCurrency(1_109_057.64)  // '$1.1m'
 * compactCurrency(-1_500_000)    // '-$1.5m'
 * compactCurrency(12_400)        // '$12k'
 */
export function compactCurrency(
	value: number | null | undefined,
	options: { currency?: string; fallback?: string } = {}
): string {
	const { currency = 'AUD', fallback = FALLBACK } = options;
	if (value === null || value === undefined || !Number.isFinite(value)) return fallback;

	const prefix = currencyPrefix(currency);
	// Sign outside the symbol, as everywhere else here: `-$1.5m`, not `$-1.5m`.
	const sign = value < 0 ? '-' : '';
	const abs = Math.abs(value);

	if (abs >= 1_000_000) return `${sign}${prefix}${(abs / 1_000_000).toFixed(1)}m`;
	if (abs >= 1_000) return `${sign}${prefix}${Math.round(abs / 1_000)}k`;
	return `${sign}${prefix}${Math.round(abs)}`;
}

/**
 * Format a money figure that arrives as a STRING, without ever parsing it to a
 * JS number.
 *
 * A securities tax P&L reaches a tax return, so a figure must render with the
 * exact digits the API sent — `parseFloat` rounds at 2^53 and quietly changes
 * cents on a nine-figure total. This groups the integer part with thousands
 * separators and preserves the fractional part verbatim, so the displayed
 * string is faithful to the source decimal whatever its magnitude.
 *
 * @example
 * formatCurrencyString('1234.56')     // '$1,234.56'
 * formatCurrencyString('-1234567.89') // '-$1,234,567.89'
 * formatCurrencyString('0')           // '$0'
 * formatCurrencyString(null)          // 'N/A'
 */
export function formatCurrencyString(
	value: string | null | undefined,
	options: { fallback?: string } = {}
): string {
	const { fallback = FALLBACK } = options;

	if (value === null || value === undefined) return fallback;
	const trimmed = String(value).trim();
	if (trimmed === '' || trimmed === 'NaN') return fallback;

	let negative = false;
	let body = trimmed;
	if (body.startsWith('-')) {
		negative = true;
		body = body.slice(1);
	} else if (body.startsWith('+')) {
		body = body.slice(1);
	}

	const [rawInt, rawFrac] = body.split('.');
	const intPart = (rawInt ?? '').replace(/[^0-9]/g, '') || '0';
	const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

	let out = grouped;
	if (rawFrac !== undefined) out += `.${rawFrac}`;

	return `${negative ? '-' : ''}$${out}`;
}

/**
 * Report the sign of a money value without parsing a string to a number — the
 * float-free companion to `formatCurrencyString`, for choosing a tone class.
 */
export function isNegativeMoney(value: string | number | null | undefined): boolean {
	if (value === null || value === undefined) return false;
	if (typeof value === 'number') return value < 0;
	return value.trim().startsWith('-');
}

// --------------------------------------------------------------------------- //
//  Numbers and percentages                                                     //
// --------------------------------------------------------------------------- //

/**
 * Format a number with thousands separators.
 *
 * @example
 * formatNumber(1234567)                  // '1,234,567'
 * formatNumber(1234.567, { decimals: 2 }) // '1,234.57'
 * formatNumber(null)                      // 'N/A'
 */
export function formatNumber(
	value: number | string | null | undefined,
	options: { decimals?: number; fallback?: string } = {}
): string {
	const { decimals = 0, fallback = FALLBACK } = options;

	const num = toFiniteNumber(value);
	if (num === null) return fallback;

	return new Intl.NumberFormat(AU_LOCALE, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals
	}).format(num);
}

/**
 * Format a value that is ALREADY in percentage points: `4.5` renders `4.5%`.
 *
 * Its counterpart for a 0–1 ratio is `formatRatioAsPercentage`. The two are
 * named apart on purpose — the apps disagreed about which one `formatPercent`
 * meant, and picking either spelling for both would make a 100x error a
 * one-character mistake.
 *
 * @example
 * formatPercentage(4.5)                    // '4.5%'
 * formatPercentage('4.5', { decimals: 2 }) // '4.50%'
 * formatPercentage(null)                   // 'N/A'
 */
export function formatPercentage(
	value: number | string | null | undefined,
	options: { decimals?: number; fallback?: string } = {}
): string {
	const { decimals = 1, fallback = FALLBACK } = options;

	const num = toFiniteNumber(value);
	if (num === null) return fallback;

	return `${num.toFixed(decimals)}%`;
}

/**
 * Format a 0–1 RATIO as a percentage: `0.045` renders `4.5%`.
 *
 * @example
 * formatRatioAsPercentage(0.045)  // '4.5%'
 * formatRatioAsPercentage(1)      // '100.0%'
 * formatRatioAsPercentage(null)   // 'N/A'
 */
export function formatRatioAsPercentage(
	value: number | string | null | undefined,
	options: { decimals?: number; fallback?: string } = {}
): string {
	const { decimals = 1, fallback = FALLBACK } = options;

	const num = toFiniteNumber(value);
	if (num === null) return fallback;

	return `${(num * 100).toFixed(decimals)}%`;
}

// --------------------------------------------------------------------------- //
//  Dates and times                                                             //
// --------------------------------------------------------------------------- //

// Intl `en-AU` short months are not uniformly three characters: June, July and
// Sept come back four. Force a canonical abbreviation so a date column aligns.
const SHORT_MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

const LONG_MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** `19 Dec 2024`, `19 December 2024`, or `19/12/2024`. */
export type DateFormat = 'short' | 'long' | 'numeric';

export interface DateOptions {
	format?: DateFormat;
	/** Rendered when the value is null, undefined or empty. */
	fallback?: string;
	/** IANA zone a timestamp is read in. Defaults to `Australia/Brisbane`. */
	timeZone?: string;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a timestamp the API returned.
 *
 * A backend that stores naive UTC (`datetime.now(UTC).replace(tzinfo=None)`)
 * and serialises it with no offset hands JavaScript a string it reads as LOCAL
 * time: in Brisbane that lands every stored moment ten hours early, so anything
 * after 2pm shows the wrong DAY, not merely the wrong hour. An offset-less
 * value carrying a time is therefore read as UTC; one that carries an offset is
 * left alone, and a date-only value is left alone too (appending a `Z` to it
 * produces an Invalid Date).
 */
export function parseApiDate(iso: string): Date {
	const hasTime = iso.includes('T');
	const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso);
	return new Date(hasTime && !hasOffset ? `${iso}Z` : iso);
}

interface ZonedParts {
	day: number;
	month: number;
	year: number;
	hour: string;
	minute: string;
}

/** The calendar fields of an instant, as read in `timeZone`. */
function zonedParts(date: Date, timeZone: string): ZonedParts {
	const parts = new Intl.DateTimeFormat(AU_LOCALE, {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(date);

	const value = (type: Intl.DateTimeFormatPartTypes): string =>
		parts.find((part) => part.type === type)?.value ?? '';

	return {
		day: Number(value('day')),
		month: Number(value('month')),
		year: Number(value('year')),
		hour: value('hour'),
		minute: value('minute')
	};
}

/** Render already-resolved calendar fields in one of the three date shapes. */
function renderDate(day: number, month: number, year: number, format: DateFormat): string {
	const dd = String(day).padStart(2, '0');
	if (format === 'numeric') {
		return `${dd}/${String(month).padStart(2, '0')}/${year}`;
	}
	const name = (format === 'long' ? LONG_MONTHS : SHORT_MONTHS)[month - 1];
	return `${dd} ${name} ${year}`;
}

/**
 * Format a date for an Australian reader.
 *
 * A date-only value (`YYYY-MM-DD`) renders the day it NAMES, with no timezone
 * conversion — a date is not an instant, and converting one is how a booking
 * dated the 1st shows as the 31st. A value carrying a time is an instant, and
 * is read in `timeZone` (`Australia/Brisbane` by default, not the browser's
 * zone, so the same record reads the same on a laptop in another country).
 *
 * A string that will not parse is returned unchanged rather than hidden behind
 * the fallback: an unexpected date format is worth seeing.
 *
 * @example
 * formatDate('2024-12-19')                        // '19 Dec 2024'
 * formatDate('2024-12-19', { format: 'long' })    // '19 December 2024'
 * formatDate('2024-12-19', { format: 'numeric' }) // '19/12/2024'
 * formatDate(null)                                // 'N/A'
 */
export function formatDate(
	value: string | Date | null | undefined,
	options: DateOptions = {}
): string {
	const { format = 'short', fallback = FALLBACK, timeZone = AU_TIME_ZONE } = options;

	if (value === null || value === undefined) return fallback;

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed === '') return fallback;

		const dateOnly = DATE_ONLY.exec(trimmed);
		if (dateOnly) {
			const year = Number(dateOnly[1]);
			const month = Number(dateOnly[2]);
			const day = Number(dateOnly[3]);
			// A well-shaped but impossible date (2024-13-45) is returned as sent.
			if (month < 1 || month > 12 || day < 1 || day > 31) return trimmed;
			return renderDate(day, month, year, format);
		}

		const parsed = parseApiDate(trimmed);
		if (Number.isNaN(parsed.getTime())) return trimmed;
		const parts = zonedParts(parsed, timeZone);
		return renderDate(parts.day, parts.month, parts.year, format);
	}

	if (Number.isNaN(value.getTime())) return fallback;
	const parts = zonedParts(value, timeZone);
	return renderDate(parts.day, parts.month, parts.year, format);
}

/**
 * Format a timestamp as a date and a 24-hour time: `19 Dec 2024, 14:05`.
 *
 * 24 hours, not `2:05 pm`: it is unambiguous and it aligns in a column, which
 * is where a timestamp almost always sits.
 *
 * @example
 * formatDateTime('2024-12-19T04:05:00')                   // '19 Dec 2024, 14:05'
 * formatDateTime('2024-12-19T04:05:00Z', { format: 'numeric' }) // '19/12/2024, 14:05'
 * formatDateTime(null)                                    // 'N/A'
 */
export function formatDateTime(
	value: string | Date | null | undefined,
	options: DateOptions = {}
): string {
	const { format = 'short', fallback = FALLBACK, timeZone = AU_TIME_ZONE } = options;

	if (value === null || value === undefined) return fallback;

	let instant: Date;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed === '') return fallback;
		instant = parseApiDate(trimmed);
		if (Number.isNaN(instant.getTime())) return trimmed;
	} else {
		instant = value;
		if (Number.isNaN(instant.getTime())) return fallback;
	}

	const parts = zonedParts(instant, timeZone);
	const date = renderDate(parts.day, parts.month, parts.year, format);
	return `${date}, ${parts.hour}:${parts.minute}`;
}
