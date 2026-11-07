import { Validator, type OutputUnit } from '@cfworker/json-schema';
import type { isVisible } from '@jsonforms/core';

/** The `ajv` slot `@jsonforms/core`'s rule helpers take. */
export type FormAjv = NonNullable<Parameters<typeof isVisible>[3]>;

export interface FieldError {
	/** Dot path of the offending field (the missing one, for `required`). */
	path: string;
	message: string;
}

/**
 * The form's validator. It INTERPRETS the schema; Ajv's `compile` and
 * `validate` generate source and run it through `new Function`, which the
 * apps' `script-src 'self'` (no `unsafe-eval`) refuses. The schema arrives at
 * runtime from the server, so Ajv's build-time standalone mode cannot help.
 */
const check = (schema: object, value: unknown): OutputUnit[] => {
	// JSON round trip: an `undefined` property is absent, as Ajv read it.
	const result = new Validator(schema, '2019-09', false).validate(JSON.parse(JSON.stringify(value ?? null)));
	return result.valid ? [] : result.errors;
};

/** What `@jsonforms/core` calls for a rule's schema condition. */
export const createRuleEvaluator = (): FormAjv =>
	({ validate: (schema: object, value: unknown) => check(schema, value).length === 0 }) as unknown as FormAjv;

const dotPath = (location: string) =>
	location.replace(/^#\/?/, '').split('/').filter(Boolean).join('.');

/** Field errors for `value` against `schema`, empty when valid. */
export const validateValue = (schema: object, value: unknown): FieldError[] => {
	const out: FieldError[] = [];
	for (const error of check(schema, value)) {
		// Only leaf keywords name a field; container keywords (properties,
		// allOf...) restate their children's failures.
		if (['properties', 'items', 'allOf', 'anyOf', 'oneOf', '$ref', '$recursiveRef'].includes(error.keyword))
			continue;
		const instance = dotPath(error.instanceLocation);
		if (error.keyword === 'required') {
			const missing = /"([^"]+)"/.exec(error.error)?.[1];
			const path = [instance, missing].filter(Boolean).join('.');
			if (path) out.push({ path, message: 'Required' });
			continue;
		}
		if (instance) out.push({ path: instance, message: error.error });
	}
	return out;
};
