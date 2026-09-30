<script lang="ts">
	import { createAjv, Generate, type UISchemaElement } from '@jsonforms/core';
	import Panel from '../panel/panel.svelte';
	import SchemaFormElement from './schema-form-element.svelte';
	import UnknownField from './widgets/unknown-field.svelte';
	import { setSchemaFormContext } from './context.js';
	import { addressedPaths, getAt, setAt, unmappedFields } from './data.js';
	import { cn } from '$lib/utils.js';
	import type { SchemaFormProps } from './types.js';

	/**
	 * Render a form the server described: a JSON Schema for what the value IS,
	 * and a JSON Forms UI Schema for how it is laid out.
	 *
	 * This component knows nothing about any application. It takes the two
	 * documents, the current value and a change handler; it performs no fetch,
	 * holds no endpoint, and names no service. That is what lets the engine
	 * behind the schema be swapped without touching a consumer — and what lets
	 * three apps that each hand-rolled this converge on one renderer.
	 *
	 * `@jsonforms/core` is used HEADLESS — for JSON-Pointer scope resolution,
	 * rule evaluation and Ajv only. The renderers are this package's own and
	 * dispatch to this package's own widgets; there is no official Svelte
	 * renderer for JSON Forms and the community one carries no external
	 * validation.
	 *
	 * THE ONE NON-NEGOTIABLE RULE: nothing renders silently as nothing. An
	 * unknown widget hint, an unknown element type, a scope that resolves to
	 * nothing, or a schema property the layout never mentions each renders as a
	 * flagged fallback carrying `data-schema-form-unknown`. The renderers this
	 * replaces failed all four ways in silence, and shipped that way for months.
	 */
	let {
		schema,
		uischema,
		value,
		onChange,
		disabled = false,
		idPrefix = 'sf',
		class: className
	}: SchemaFormProps = $props();

	// One Ajv for the life of the form: rule conditions and validation both use
	// it, and compiling per keystroke would be the whole cost of the component.
	const ajv = createAjv();

	// No UI schema is a legitimate mode, not an error: generating one from the
	// schema is the only arrangement in which a field CANNOT be missing from the
	// layout, so it is the safe default rather than a blank form.
	const layout = $derived(uischema ?? (Generate.uiSchema(schema) as UISchemaElement));

	const addressed = $derived(addressedPaths(layout));
	const unmapped = $derived(unmappedFields(schema, addressed));

	/**
	 * Validation messages by dot path. Ajv is asked about a CLONE, because
	 * `createAjv` enables `useDefaults` and would otherwise write defaults into
	 * the caller's value behind its back.
	 */
	const errors = $derived.by(() => {
		const byPath: Record<string, string[]> = {};
		try {
			const validate = ajv.compile(schema as object);
			const probe = structuredClone($state.snapshot(value));
			if (validate(probe)) return byPath;
			for (const error of validate.errors ?? []) {
				const missing = (error.params as { missingProperty?: string })?.missingProperty;
				const instance = error.instancePath.replace(/^\//, '').split('/').filter(Boolean).join('.');
				const path = missing ? [instance, missing].filter(Boolean).join('.') : instance;
				if (!path) continue;
				(byPath[path] ??= []).push(missing ? 'Required' : (error.message ?? 'is invalid'));
			}
		} catch {
			// A schema Ajv will not compile, or a value it will not clone, is still
			// a form this renderer can lay out — it simply cannot be validated.
			// Never let a validation problem blank the form: that is the failure
			// mode this whole component exists to remove.
			return byPath;
		}
		return byPath;
	});

	setSchemaFormContext({
		get schema() {
			return schema;
		},
		get data() {
			return value;
		},
		get disabled() {
			return disabled;
		},
		get idPrefix() {
			return idPrefix;
		},
		get errors() {
			return errors;
		},
		ajv,
		change(path, next) {
			onChange(setAt($state.snapshot(value) as Record<string, unknown>, path, next), {
				path,
				value: next
			});
		}
	});
</script>

<div class={cn('grid gap-4', className)} data-schema-form="">
	<SchemaFormElement element={layout} />

	{#if unmapped.length}
		<!--
			The defect this section exists for: in the renderer being retired, three
			whole top-level config groups never rendered because their names were
			absent from a hardcoded order. Nothing failed, nothing warned — the
			groups were simply not there. A field the layout does not mention is now
			the loudest thing on the page instead of the quietest.
		-->
		<Panel
			title="Not in the layout"
			subtitle="{unmapped.length} field{unmapped.length === 1 ? '' : 's'} no Control addresses"
			data-schema-form-unmapped=""
		>
			<p class="text-muted-foreground mb-3 text-xs">
				The JSON Schema describes {unmapped.length === 1 ? 'this field' : 'these fields'} but the UI
				schema never {unmapped.length === 1 ? 'mentions it' : 'mentions them'}. Add a Control for
				each; until then {unmapped.length === 1 ? 'it is' : 'they are'} edited raw here rather than
				disappearing.
			</p>
			<div class="grid gap-3">
				{#each unmapped as field (field.path)}
					<UnknownField
						id="{idPrefix}-unmapped-{field.path.replace(/[^a-zA-Z0-9_-]/g, '-')}"
						label={(field.schema as { title?: string }).title ?? field.path}
						scope={field.scope}
						path={field.path}
						schema={field.schema}
						reason={field.reason}
						{disabled}
						detail="no Control in the UI schema addresses this property"
						value={getAt(value, field.path)}
						onchange={(next) =>
							onChange(
								setAt($state.snapshot(value) as Record<string, unknown>, field.path, next),
								{ path: field.path, value: next }
							)}
					/>
				{/each}
			</div>
		</Panel>
	{/if}
</div>
