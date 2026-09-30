import type { JsonSchema, UISchemaElement } from '@jsonforms/core';

export type { JsonSchema, UISchemaElement };

/**
 * The widgets `<SchemaForm>` can dispatch a Control to. This list IS the
 * contract: a hint naming anything outside it resolves to `'unknown'` and
 * renders loudly, it does not fall back to a default control and it never
 * renders nothing.
 */
export const WIDGET_KINDS = [
	'text',
	'textarea',
	'password',
	'number',
	'slider',
	'date',
	'time',
	'datetime',
	'select',
	'radio',
	'switch',
	'checkbox',
	'tags'
] as const;

export type WidgetKind = (typeof WIDGET_KINDS)[number] | 'unknown';

/**
 * Why something could not be rendered as a real control. Every value is
 * surfaced in the DOM as `data-unknown-reason`, so a consuming app's own gate
 * can assert on it, and so a screenshot of a broken form says WHY it is broken.
 */
export type UnknownReason =
	/** `options.format`/`options.widget` named a widget this package does not ship. */
	| 'unknown-widget'
	/** The UI schema element's `type` is not in the JSON Forms vocabulary this renderer walks. */
	| 'unknown-element'
	/** The Control's `scope` pointer resolves to nothing in the JSON Schema. */
	| 'unresolved-scope'
	/** The Control has no `scope` at all. */
	| 'missing-scope'
	/** The resolved subschema has a `type` no widget covers. */
	| 'unsupported-type'
	/** A Control addressing an object — an object needs a layout, not a control. */
	| 'object-control'
	/** A hint asked for a closed value set, but the subschema declares none. */
	| 'no-options'
	/** An array whose items are not primitives; `tags` cannot represent it. */
	| 'unsupported-array'
	/** The JSON Schema describes this field but the UI schema never mentions it. */
	| 'not-in-layout';

/** The change `<SchemaForm>` emits alongside the next whole value. */
export interface SchemaFormChange {
	/** Dot path of the field that changed, e.g. `tuning.depth`. */
	path: string;
	/** The field's new value. */
	value: unknown;
}

export interface SchemaFormProps {
	/** The JSON Schema describing the object being edited. */
	schema: JsonSchema;
	/**
	 * The JSON Forms UI Schema describing the layout. Omit it and one is
	 * generated from the schema, which is the only mode in which no field can
	 * be missing from the layout.
	 */
	uischema?: UISchemaElement;
	/** The current value. `<SchemaForm>` never mutates it. */
	value: Record<string, unknown>;
	/** Called with the next whole value and the single field that changed. */
	onChange: (next: Record<string, unknown>, change: SchemaFormChange) => void;
	/** Disable every control in the form. */
	disabled?: boolean;
	/** Prefix for generated element ids, when two forms share a page. */
	idPrefix?: string;
	/** Extra classes on the form's root element. */
	class?: string;
}
