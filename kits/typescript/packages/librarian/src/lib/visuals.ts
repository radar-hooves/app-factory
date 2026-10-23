/**
 * The renderers for a persona's in-answer visuals, keyed on a fence's language.
 *
 * The persona writes a fenced block and the page draws it: the data is the
 * persona's, every colour, face and size is the app's. A renderer is a
 * component and the `parse` that turns the block's text into the `value` it
 * draws, throwing on a block that is not one (the page then shows the code).
 * `parse` returns anything, not JSON alone, so a renderer for a language that
 * is not JSON registers the same way.
 */

import type { Component } from 'svelte';
import EntityCard from './components/visual-block/entity-card.svelte';
import Timeline from './components/visual-block/timeline.svelte';
import Chart from './components/visual-block/chart.svelte';

export interface Visual {
	component: Component<{ value: unknown; source: string }>;
	/** The block's text as the value its component draws; throws on a block that is invalid. */
	parse: (source: string) => unknown;
}

export interface ChartValue {
	title: string;
	type: 'bar' | 'line' | 'area';
	/** The field on the x axis; each y is a field drawn as a series. */
	x: string;
	y: string[];
	data: Array<Record<string, string | number>>;
}

export interface TimelineValue {
	title: string;
	events: Array<{ date: string; title: string; detail: string }>;
}

export interface CardValue {
	name: string;
	kind: string;
	summary: string;
	facts: Array<{ label: string; value: string }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string =>
	typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

const object = (source: string): Record<string, unknown> => {
	const value: unknown = JSON.parse(source);
	if (!isRecord(value)) throw new Error('not an object');
	return value;
};

const KINDS = ['bar', 'line', 'area'] as const;
const MAX_SERIES = 5;
const MAX_ROWS = 500;

function parseChart(source: string): ChartValue {
	const value = object(source);
	const type = KINDS.find((kind) => kind === value.type);
	if (!type) throw new Error('not a bar, line or area');
	const x = text(value.x);
	const y = Array.isArray(value.y) ? value.y.map(text) : [];
	if (!x || y.length === 0 || y.length > MAX_SERIES || y.some((key) => !key)) throw new Error('no x or y');
	const rows = Array.isArray(value.data) ? value.data : [];
	if (rows.length === 0 || rows.length > MAX_ROWS) throw new Error('no data');
	const data = rows.map((row) => {
		if (!isRecord(row) || !text(row[x])) throw new Error('a row with no x');
		const point: Record<string, string | number> = { [x]: typeof row[x] === 'number' ? row[x] : text(row[x]) };
		for (const key of y) {
			const number = row[key];
			if (typeof number !== 'number' || !Number.isFinite(number)) throw new Error('a y that is not a number');
			point[key] = number;
		}
		return point;
	});
	return { title: text(value.title), type, x, y, data };
}

function parseTimeline(source: string): TimelineValue {
	const value = object(source);
	if (!Array.isArray(value.events)) throw new Error('no events');
	return {
		title: text(value.title),
		events: value.events.map((event) => {
			if (!isRecord(event) || !text(event.title)) throw new Error('an event with no title');
			return { date: text(event.date), title: text(event.title), detail: text(event.detail) };
		})
	};
}

function parseCard(source: string): CardValue {
	const value = object(source);
	if (!text(value.name)) throw new Error('no name');
	const facts = Array.isArray(value.facts) ? value.facts : [];
	return {
		name: text(value.name),
		kind: text(value.kind),
		summary: text(value.summary),
		facts: facts
			.filter(isRecord)
			.map((fact) => ({ label: text(fact.label), value: text(fact.value) }))
			.filter((fact) => fact.label || fact.value)
	};
}

/** A chart (LayerChart), a timeline and an entity card. An app adds to these or replaces one through `ChatExtensions.visuals`. */
export const defaultVisuals: Record<string, Visual> = {
	chart: { component: Chart, parse: parseChart },
	timeline: { component: Timeline, parse: parseTimeline },
	card: { component: EntityCard, parse: parseCard }
};
