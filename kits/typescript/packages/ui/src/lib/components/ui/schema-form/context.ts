import { getContext, setContext } from 'svelte';
import type { createAjv, JsonSchema } from '@jsonforms/core';

/**
 * The Ajv instance `@jsonforms/core` builds. Typed through its own factory so
 * this package never names `ajv` — a transitive dependency of the engine, not
 * a dependency of ours.
 */
export type FormAjv = ReturnType<typeof createAjv>;

/**
 * The form-wide facts every nested element needs, published once by
 * `<SchemaForm>` rather than drilled through a recursive component tree.
 * Everything reactive is exposed as a getter, so a context read stays live
 * under Svelte 5's signals.
 */
export interface SchemaFormContext {
	/** The root JSON Schema every scope resolves against. */
	readonly schema: JsonSchema;
	/** The whole current value; rules and every widget read from here. */
	readonly data: Record<string, unknown>;
	/** Whether the whole form is disabled. */
	readonly disabled: boolean;
	/** Prefix for generated element ids. */
	readonly idPrefix: string;
	/** Validation messages by dot path, from the schema itself. */
	readonly errors: Record<string, string[]>;
	/** The shared Ajv instance rule conditions are evaluated with. */
	readonly ajv: FormAjv;
	/** Commit one field. */
	change: (path: string, value: unknown) => void;
}

const KEY = Symbol('poodle64-schema-form');

export const setSchemaFormContext = (context: SchemaFormContext) => setContext(KEY, context);

export const getSchemaFormContext = (): SchemaFormContext => {
	const context = getContext<SchemaFormContext | undefined>(KEY);
	if (!context) {
		throw new Error(
			'@poodle64/ui: a schema-form part was rendered outside <SchemaForm>. Render the form, not its internals.'
		);
	}
	return context;
};
