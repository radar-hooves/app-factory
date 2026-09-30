import { resolveSchema, toDataPath, type JsonSchema, type UISchemaElement } from '@jsonforms/core';
import type { UnknownReason } from './types.js';

/**
 * Reading and writing a value at a dot path, and the walk that decides which
 * schema properties the layout never mentioned.
 *
 * Dot paths are JSON Forms' own addressing (`toDataPath('#/properties/a/properties/b')`
 * → `a.b`), so a property name containing a literal `.` is not addressable —
 * the same limitation the wire format itself carries.
 */

export const scopeToPath = (scope: string): string => toDataPath(scope);

/** Read the value at a dot path, or `undefined`. */
export function getAt(data: unknown, path: string): unknown {
	if (!path) return data;
	let node: unknown = data;
	for (const key of path.split('.')) {
		if (node === null || typeof node !== 'object') return undefined;
		node = (node as Record<string, unknown>)[key];
	}
	return node;
}

/**
 * Return a copy of `data` with `path` set to `value`. Every object along the
 * way is copied, so a consumer holding the previous value still holds the
 * previous value — a `$state` consumer and an immutable store both work.
 */
export function setAt(
	data: Record<string, unknown>,
	path: string,
	value: unknown
): Record<string, unknown> {
	const keys = path.split('.');
	const root: Record<string, unknown> = { ...data };
	let node = root;
	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		const child = node[key];
		node[key] = child && typeof child === 'object' && !Array.isArray(child)
			? { ...(child as Record<string, unknown>) }
			: {};
		node = node[key] as Record<string, unknown>;
	}
	node[keys[keys.length - 1]] = value;
	return root;
}

/** Every UI schema element in the tree, depth first. */
export function walkElements(element: UISchemaElement | undefined): UISchemaElement[] {
	if (!element) return [];
	const children = (element as { elements?: UISchemaElement[] }).elements ?? [];
	return [element, ...children.flatMap(walkElements)];
}

/** The dot paths every Control in the tree addresses. */
export function addressedPaths(uischema: UISchemaElement | undefined): Set<string> {
	const paths = new Set<string>();
	for (const element of walkElements(uischema)) {
		const scope = (element as { scope?: string }).scope;
		if (element.type === 'Control' && typeof scope === 'string' && scope.startsWith('#')) {
			paths.add(scopeToPath(scope));
		}
	}
	return paths;
}

export interface UnmappedField {
	/** Dot path of the property nothing in the layout addresses. */
	path: string;
	/** JSON Pointer scope, so the fix is a copy-paste into the UI schema. */
	scope: string;
	schema: JsonSchema;
	reason: UnknownReason;
}

/**
 * Every schema property no Control addresses.
 *
 * This is the check that would have caught the estate's live defect: three
 * whole top-level config groups never rendered because their names were absent
 * from a hardcoded GROUP_ORDER, and a missing group produced no output and no
 * error. Here a group nothing addresses is reported ONCE, at the group — the
 * walk does not descend into a subtree the layout ignores entirely, so an
 * unmentioned group is one loud entry rather than forty.
 */
export function unmappedFields(
	root: JsonSchema,
	addressed: Set<string>,
	node: JsonSchema = root,
	scope = '#',
	path = ''
): UnmappedField[] {
	const properties = (node as { properties?: Record<string, JsonSchema> }).properties;
	if (!properties) return [];

	const found: UnmappedField[] = [];
	for (const [key, raw] of Object.entries(properties)) {
		const childPath = path ? `${path}.${key}` : key;
		const childScope = `${scope}/properties/${key}`;
		// `resolveSchema` follows any $ref, so a property behind a definition is
		// judged on the schema it actually resolves to.
		const child = resolveSchema(root, childScope, root) ?? raw;

		// Addressed BY ITSELF: a Control points at this property. Whatever it does
		// with it is that Control's business — do not descend and second-guess it.
		if (addressed.has(childPath)) continue;

		// Addressed BELOW: some Control points inside it, so the layout knows about
		// this subtree and only some of its leaves are missing.
		if ([...addressed].some((addressedPath) => addressedPath.startsWith(`${childPath}.`))) {
			found.push(...unmappedFields(root, addressed, child, childScope, childPath));
			continue;
		}

		// Addressed nowhere: report it here, once, and do not descend — an
		// unmentioned group is one loud entry, not forty.
		found.push({ path: childPath, scope: childScope, schema: child, reason: 'not-in-layout' });
	}
	return found;
}
