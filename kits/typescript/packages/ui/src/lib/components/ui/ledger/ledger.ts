/**
 * The ledger's reading of dates, periods and money: pure, so the component and
 * its tests share one. Dates are ISO `YYYY-MM-DD` and are never converted
 * through a time zone: a date is not an instant.
 */
import { formatCurrency } from '$lib/format.js';
import type { LedgerPeriod, LedgerRow } from './types.js';

export const LEDGER_PERIODS: readonly { value: LedgerPeriod; label: string }[] = [
	{ value: 'fy', label: 'Financial year' },
	{ value: 'cy', label: 'Calendar year' },
	{ value: 'month', label: 'Month' },
	{ value: 'week', label: 'Week' },
	{ value: 'day', label: 'Day' },
	{ value: 'none', label: 'None' }
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
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
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parts(iso: string): [number, number, number] {
	return [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
}

/** A calendar date `days` on from an ISO date, in UTC so no clock change moves it. */
function shift(iso: string, days: number): Date {
	const [y, m, d] = parts(iso);
	return new Date(Date.UTC(y, m - 1, d + days));
}

function isoOf(t: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** "15 Sep", or "15 Sep 2026" with the year. */
export function ledgerDate(iso: string, withYear = true): string {
	const [y, m, d] = parts(iso);
	return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

/** The year a financial year ends in. A January start makes it the calendar year. */
function fyEnd(iso: string, fyStart: number): number {
	const [y, m] = parts(iso);
	return fyStart > 1 && m >= fyStart ? y + 1 : y;
}

/** The group a date falls in: sortable, so newer keys sort later. */
export function periodKey(iso: string, period: LedgerPeriod, fyStart = 7): string {
	switch (period) {
		case 'fy':
			return String(fyEnd(iso, fyStart));
		case 'cy':
			return iso.slice(0, 4);
		case 'month':
			return iso.slice(0, 7);
		case 'week': {
			const [y, m, d] = parts(iso);
			const monday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
			return isoOf(shift(iso, -monday));
		}
		case 'day':
			return iso.slice(0, 10);
		default:
			return '';
	}
}

/** A group's label: "FY 2025–26", "2026", "September 2026", "15 to 21 Sep 2026", "Tuesday 15 Sep 2026". */
export function periodLabel(
	key: string,
	period: LedgerPeriod,
	fyStart = 7,
	withYear = true
): string {
	switch (period) {
		case 'fy': {
			const end = Number(key);
			return fyStart > 1 ? `FY ${end - 1}–${String(end).slice(2)}` : `FY ${end}`;
		}
		case 'cy':
			return key;
		case 'month':
			return `${MONTHS_LONG[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
		case 'week': {
			const end = isoOf(shift(key, 6));
			const [sy, sm, sd] = parts(key);
			const [ey, em] = parts(end);
			const start = `${sd}${sm !== em ? ` ${MONTHS[sm - 1]}` : ''}${sy !== ey ? ` ${sy}` : ''}`;
			return `${start} to ${ledgerDate(end, withYear || sy !== ey)}`;
		}
		case 'day': {
			const [y, m, d] = parts(key);
			return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${ledgerDate(key, withYear)}`;
		}
		default:
			return '';
	}
}

/** "Jul 2025 to Jun 2026", or "Jul 2026 to now" for the year still open on `today`. */
export function fySpan(key: string, fyStart = 7, today = isoOf(new Date())): string {
	const end = Number(key);
	const from = `${MONTHS[fyStart - 1]} ${fyStart > 1 ? end - 1 : end}`;
	if (fyEnd(today, fyStart) === end) return `${from} to now`;
	return `${from} to ${MONTHS[(fyStart + 10) % 12]} ${end}`;
}

/** Rows newest first, a day's rows in the order given, grouped by period. */
export function groupRows<R extends LedgerRow>(
	rows: readonly R[],
	period: LedgerPeriod,
	fyStart = 7
): { key: string; rows: R[] }[] {
	const sorted = [...rows].sort((a, b) =>
		a.date.slice(0, 10) < b.date.slice(0, 10)
			? 1
			: a.date.slice(0, 10) > b.date.slice(0, 10)
				? -1
				: 0
	);
	const out: { key: string; rows: R[] }[] = [];
	for (const r of sorted) {
		const key = periodKey(r.date, period, fyStart);
		const last = out[out.length - 1];
		if (last && last.key === key) last.rows.push(r);
		else out.push({ key, rows: [r] });
	}
	return out;
}

/** Whole cents, so a group's sum carries no float error. */
export function cents(value: number | string | null | undefined): number {
	const n = Number(value);
	return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Money as the ledger prints it: in plain, out in brackets. */
export function ledgerMoney(value: number | string, currency = 'AUD'): string {
	return formatCurrency(value, { currency, negative: 'brackets' });
}
