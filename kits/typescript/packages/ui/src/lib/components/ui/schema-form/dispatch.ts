import type { JsonSchema } from '@jsonforms/core';
import { WIDGET_KINDS, type UnknownReason, type WidgetKind } from './types.js';

/**
 * Control → widget resolution, as a pure function so the table can be asserted
 * without rendering anything.
 *
 * THE RULE THIS FILE EXISTS FOR: every branch that cannot produce a real widget
 * returns `{ widget: 'unknown', reason }`. There is no branch that returns
 * nothing, and no branch that quietly substitutes a default for a hint it did
 * not understand. The estate's previous home-grown renderer had both, and a
 * `widget: "dropdown"` hint therefore rendered no input at all for months
 * without anyone noticing.
 */

export interface WidgetChoice {
	widget: WidgetKind;
	/** Present exactly when `widget === 'unknown'`. */
	reason?: UnknownReason;
	/** Human-readable specifics for the flagged render, e.g. the rejected hint. */
	detail?: string;
}

const KNOWN = new Set<string>(WIDGET_KINDS);

/** The primitive JSON Schema types a `tags` widget can carry as array items. */
const TAGGABLE = new Set(['string', 'number', 'integer']);

/** JSON Schema `format` → the input type that renders it. */
const FORMAT_WIDGETS: Record<string, WidgetKind> = {
	password: 'password',
	date: 'date',
	time: 'time',
	'date-time': 'datetime'
};

/** The first `type` a subschema declares (JSON Schema allows an array of them). */
export function schemaType(schema: JsonSchema | undefined): string | undefined {
	const t = (schema as { type?: string | string[] } | undefined)?.type;
	if (Array.isArray(t)) return t.find((entry) => entry !== 'null') ?? t[0];
	return t;
}

/** Does this subschema carry a closed set of values a select can list? */
export function enumOptions(schema: JsonSchema | undefined): { value: unknown; label: string }[] | null {
	if (!schema) return null;
	const withEnum = schema as { enum?: unknown[]; oneOf?: { const?: unknown; title?: string }[] };
	if (Array.isArray(withEnum.enum)) {
		return withEnum.enum.map((value) => ({ value, label: String(value) }));
	}
	// The `oneOf: [{ const, title }]` spelling — how a server labels its enum.
	if (Array.isArray(withEnum.oneOf) && withEnum.oneOf.every((entry) => 'const' in entry)) {
		return withEnum.oneOf.map((entry) => ({
			value: entry.const,
			label: entry.title ?? String(entry.const)
		}));
	}
	return null;
}

/**
 * Resolve a Control to a widget.
 *
 * @param schema  the subschema the Control's scope resolved to, or `undefined`
 *                if the scope resolved to nothing at all.
 * @param options the Control's `options` object from the UI schema.
 */
export function pickWidget(
	schema: JsonSchema | undefined,
	options: Record<string, unknown> = {}
): WidgetChoice {
	// 1. A scope that resolves to nothing is the most fundamental defect there is
	//    — flag it before anything else, hint or no hint.
	if (!schema) {
		return {
			widget: 'unknown',
			reason: 'unresolved-scope',
			detail: 'no such property in the JSON Schema'
		};
	}

	// 2. An explicit hint wins — and an unrecognised one is LOUD, never a default.
	//    `format` is the JSON Forms spelling; `widget` is accepted because the
	//    estate's outgoing x-ui vocabulary used it, so a migrating server does
	//    not have to change both documents at once.
	const hint = options.format ?? options.widget;
	if (typeof hint === 'string') {
		if (KNOWN.has(hint)) {
			// A select or a radio group over nothing renders as an empty box — which
			// is the vanishing act this whole component exists to stop, one level
			// down from an unrecognised hint.
			if ((hint === 'select' || hint === 'radio') && !enumOptions(schema)?.length) {
				return {
					widget: 'unknown',
					reason: 'no-options',
					detail: `the "${hint}" widget needs a closed value set, and this subschema declares no enum or oneOf`
				};
			}
			return { widget: hint as WidgetKind };
		}
		return {
			widget: 'unknown',
			reason: 'unknown-widget',
			detail: `no widget is registered for "${hint}"`
		};
	}
	if (hint !== undefined) {
		return {
			widget: 'unknown',
			reason: 'unknown-widget',
			detail: `widget hint must be a string, got ${typeof hint}`
		};
	}

	// 3. The two boolean options JSON Forms itself defines.
	const type = schemaType(schema);
	if (options.multi === true && type === 'string') return { widget: 'textarea' };
	if (options.slider === true && (type === 'number' || type === 'integer')) return { widget: 'slider' };

	// 4. Derive from the schema.
	const closedSet = enumOptions(schema);
	if (closedSet) {
		if (!closedSet.length) {
			return {
				widget: 'unknown',
				reason: 'no-options',
				detail: 'the subschema declares an empty enum, so there is nothing to choose from'
			};
		}
		return { widget: 'select' };
	}

	switch (type) {
		case 'boolean':
			return { widget: 'switch' };
		case 'integer':
		case 'number':
			return { widget: 'number' };
		case 'string': {
			const format = (schema as { format?: string }).format;
			if (format && FORMAT_WIDGETS[format]) return { widget: FORMAT_WIDGETS[format] };
			return { widget: 'text' };
		}
		case 'array': {
			const items = (schema as { items?: JsonSchema | JsonSchema[] }).items;
			const itemType = Array.isArray(items) ? undefined : schemaType(items);
			if (itemType && TAGGABLE.has(itemType)) return { widget: 'tags' };
			return {
				widget: 'unknown',
				reason: 'unsupported-array',
				detail: `array items are ${itemType ? `"${itemType}"` : 'unspecified'}; only string, number and integer items render as tags`
			};
		}
		case 'object':
			return {
				widget: 'unknown',
				reason: 'object-control',
				detail: 'an object needs a layout with Controls for its properties, not one Control'
			};
		default:
			return {
				widget: 'unknown',
				reason: 'unsupported-type',
				detail: type ? `no widget renders type "${type}"` : 'the subschema declares no type'
			};
	}
}
