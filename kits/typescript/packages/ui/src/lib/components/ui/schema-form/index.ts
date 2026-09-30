export { default as SchemaForm } from './schema-form.svelte';
export { default } from './schema-form.svelte';

export { pickWidget, enumOptions, schemaType, type WidgetChoice } from './dispatch.js';
export { addressedPaths, unmappedFields, scopeToPath, getAt, setAt } from './data.js';
export {
	WIDGET_KINDS,
	type WidgetKind,
	type UnknownReason,
	type SchemaFormChange,
	type SchemaFormProps,
	type JsonSchema,
	type UISchemaElement
} from './types.js';
