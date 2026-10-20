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
import VegaChart from './components/visual-block/vega-chart.svelte';

export interface Visual {
	component: Component<{ value: unknown; source: string }>;
	/** The block's text as the value its component draws; throws on a block that is invalid. */
	parse: (source: string) => unknown;
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

/** Any string naming an address: a spec that carries one could fetch it, or link to it carrying the conversation out. */
const ADDRESS = /^[a-z][a-z0-9+.-]*:|\/\//i;

/**
 * A spec that names an address anywhere, by key or by value, or carries
 * `usermeta`, whose `embedOptions` vega-embed merges over the app's own
 * (`config` or `patch` as a URL is fetched, `actions` turns the export menu back on).
 */
function addressed(value: unknown): boolean {
	if (typeof value === 'string') return ADDRESS.test(value.trim());
	if (Array.isArray(value)) return value.some(addressed);
	if (!isRecord(value)) return false;
	return Object.entries(value).some(
		// `$schema` names the spec's own version and is never drawn or fetched (`vega-chart` drops it).
		([key, inner]) =>
			key !== '$schema' && (key === 'url' || key === 'href' || key === 'usermeta' || addressed(inner))
	);
}

const VIEWS = ['mark', 'layer', 'hconcat', 'vconcat', 'concat', 'facet', 'repeat'];

function parseVega(source: string): unknown {
	const spec = object(source);
	if (!VIEWS.some((key) => key in spec)) throw new Error('not a view');
	if (addressed(spec)) throw new Error('names an address');
	return spec;
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

/** A chart, a timeline and an entity card. An app adds to these or replaces one through `ChatExtensions.visuals`. */
export const defaultVisuals: Record<string, Visual> = {
	'vega-lite': { component: VegaChart, parse: parseVega },
	timeline: { component: Timeline, parse: parseTimeline },
	card: { component: EntityCard, parse: parseCard }
};
