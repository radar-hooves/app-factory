<script lang="ts">
	import { isEnabled, resolveSchema, type ControlElement } from '@jsonforms/core';
	import Label from '../label/label.svelte';
	import SchemaFormWidget from './schema-form-widget.svelte';
	import UnknownField from './widgets/unknown-field.svelte';
	import { getSchemaFormContext } from './context.js';
	import { pickWidget } from './dispatch.js';
	import { getAt, scopeToPath } from './data.js';
	import type { JsonSchema } from './types.js';

	/**
	 * One Control: resolve its scope against the JSON Schema, choose a widget,
	 * and frame it with its label, description and validation message.
	 *
	 * Every way this can fail — no scope, a scope that resolves to nothing, a
	 * widget hint nobody registered — leaves through `<UnknownField>`, never
	 * through a branch that renders nothing.
	 */
	let { element }: { element: ControlElement } = $props();

	const form = getSchemaFormContext();

	const scope = $derived(typeof element.scope === 'string' ? element.scope : '');
	const path = $derived(scope ? scopeToPath(scope) : '');
	const subschema = $derived(
		scope ? (resolveSchema(form.schema, scope, form.schema) as JsonSchema | undefined) : undefined
	);
	const options = $derived((element.options ?? {}) as Record<string, unknown>);
	const choice = $derived(pickWidget(subschema, options));

	const value = $derived(path ? getAt(form.data, path) : undefined);
	const id = $derived(`${form.idPrefix}-${(path || 'unscoped').replace(/[^a-zA-Z0-9_-]/g, '-')}`);

	/** `maxDepth` / `max_depth` → `Max depth`, when nothing supplied a title. */
	const humanise = (key: string) =>
		key
			.replace(/[_-]+/g, ' ')
			.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			.replace(/^./, (first) => first.toUpperCase());

	const label = $derived(
		(typeof element.label === 'string' && element.label) ||
			(subschema as { title?: string } | undefined)?.title ||
			humanise(path.split('.').pop() || scope || 'Field')
	);

	const description = $derived((subschema as { description?: string } | undefined)?.description);

	// `required` lives on the PARENT object schema, so read it from there rather
	// than guessing from the field.
	const required = $derived.by(() => {
		const parentScope = scope.replace(/\/properties\/[^/]+$/, '');
		const key = scope.split('/').pop() ?? '';
		const parent =
			parentScope === '#' || parentScope === ''
				? form.schema
				: (resolveSchema(form.schema, parentScope, form.schema) as JsonSchema | undefined);
		return ((parent as { required?: string[] } | undefined)?.required ?? []).includes(key);
	});

	const errors = $derived(form.errors[path] ?? []);
	const disabled = $derived(
		form.disabled ||
			options.readonly === true ||
			!isEnabled(element, form.data, '', form.ajv, undefined)
	);

	const describedBy = $derived(
		[description ? `${id}-description` : null, errors.length ? `${id}-error` : null]
			.filter(Boolean)
			.join(' ') || undefined
	);

	// A toggle reads as "control, then what it toggles"; everything else reads as
	// "label, then the field". Both are still one labelled field.
	const inline = $derived(choice.widget === 'switch' || choice.widget === 'checkbox');

	const commit = (next: unknown) => form.change(path, next);
</script>

{#if !scope}
	<UnknownField
		{id}
		label={typeof element.label === 'string' ? element.label : 'Control'}
		scope="(none)"
		path=""
		value={undefined}
		reason="missing-scope"
		detail="this Control carries no scope, so there is no property to edit"
	/>
{:else if choice.widget === 'unknown'}
	<UnknownField
		{id}
		{label}
		{scope}
		{path}
		{value}
		{disabled}
		schema={subschema}
		reason={choice.reason ?? 'unsupported-type'}
		detail={choice.detail ?? 'this control could not be rendered'}
		onchange={commit}
	/>
{:else}
	<div class="grid gap-1.5" data-schema-form-field={path}>
		{#snippet widget()}
			<SchemaFormWidget
				{choice}
				schema={subschema as JsonSchema}
				{value}
				{id}
				{label}
				{scope}
				{path}
				{disabled}
				{describedBy}
				name={path}
				onchange={commit}
			/>
		{/snippet}
		{#snippet fieldLabel()}
			<Label for={id} id="{id}-label" class={disabled ? 'opacity-50' : undefined}>
				{label}{#if required}<span class="text-status-error" aria-hidden="true">&nbsp;*</span
					><span class="sr-only"> (required)</span>{/if}
			</Label>
		{/snippet}

		{#if inline}
			<!-- A toggle reads as "control, then what it toggles". -->
			<div class="flex items-center gap-2.5">
				{@render widget()}
				{@render fieldLabel()}
			</div>
		{:else}
			{@render fieldLabel()}
			{@render widget()}
		{/if}

		{#if description}
			<p id="{id}-description" class="text-muted-foreground text-xs">{description}</p>
		{/if}
		{#if errors.length}
			<p id="{id}-error" class="text-status-error text-xs">{errors.join('. ')}</p>
		{/if}
	</div>
{/if}
