/**
 * The settings API is flat, keyed by dotted names (`intelligence.extraction_model`),
 * and `<SchemaForm>` reads a `.` in a property name as a path. These nest the flat
 * document along those paths, so every key is addressable, the change it reports
 * carries the key back as `change.path`, and settings group by their domain. The
 * form's generated layout does not descend into an object, so `settingsLayout`
 * gives it one: a Group per domain, a Control per setting.
 */

import type { JsonSchema, UISchemaElement } from '@poodle64/ui/schema-form';

interface SchemaNode {
	type?: string;
	properties?: Record<string, SchemaNode>;
	[keyword: string]: unknown;
}

/** `{ 'a.b': 1, c: 2 }` → `{ a: { b: 1 }, c: 2 }`. */
export function nestValues(flat: Record<string, unknown>): Record<string, unknown> {
	const root: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(flat)) {
		const parts = key.split('.');
		const leaf = parts.pop() ?? key;
		let node = root;
		for (const part of parts) {
			node = (node[part] ??= {}) as Record<string, unknown>;
		}
		node[leaf] = value;
	}
	return root;
}

/** The same nesting for a flat object schema: each path segment becomes an object group. */
export function nestSchema(schema: JsonSchema): JsonSchema {
	const properties: Record<string, SchemaNode> = {};
	for (const [key, property] of Object.entries((schema as SchemaNode).properties ?? {})) {
		const parts = key.split('.');
		const leaf = parts.pop() ?? key;
		let node = properties;
		for (const part of parts) {
			node = (node[part] ??= { type: 'object', properties: {} }).properties ??= {};
		}
		node[leaf] = property;
	}
	return { ...schema, properties } as JsonSchema;
}

interface LayoutNode {
	type: 'VerticalLayout' | 'Group' | 'Control';
	label?: string;
	scope?: string;
	elements?: LayoutNode[];
}

/** The layout `<SchemaForm>` renders a nested settings schema with; a group's label is its segment in sentence case. */
export function settingsLayout(schema: JsonSchema): UISchemaElement {
	const layout: LayoutNode = {
		type: 'VerticalLayout',
		elements: layoutElements(schema as SchemaNode, '#')
	};
	return layout;
}

function layoutElements(schema: SchemaNode, scope: string): LayoutNode[] {
	return Object.entries(schema.properties ?? {}).map(([key, child]): LayoutNode => {
		const childScope = `${scope}/properties/${key}`;
		if (child.type === 'object' && child.properties) {
			const label = key.replaceAll('_', ' ');
			return {
				type: 'Group',
				label: label.charAt(0).toUpperCase() + label.slice(1),
				elements: layoutElements(child, childScope)
			};
		}
		return { type: 'Control', scope: childScope };
	});
}
