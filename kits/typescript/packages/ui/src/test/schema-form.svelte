<script lang="ts">
	// Harness for <SchemaForm>: holds the value the way a consuming app does —
	// the component is controlled, so a test that never writes the emitted value
	// back would be testing a form that cannot be typed into.
	import SchemaForm from '$lib/components/ui/schema-form/schema-form.svelte';
	import type { JsonSchema, SchemaFormChange, UISchemaElement } from '$lib/components/ui/schema-form';

	let {
		schema,
		uischema,
		initial = {},
		disabled = false,
		onchange
	}: {
		schema: JsonSchema;
		uischema?: UISchemaElement;
		initial?: Record<string, unknown>;
		disabled?: boolean;
		onchange?: (next: Record<string, unknown>, change: SchemaFormChange) => void;
	} = $props();

	// The seed is deliberately read once: the harness owns the value from then on,
	// exactly as a consuming app does.
	// svelte-ignore state_referenced_locally
	let value = $state<Record<string, unknown>>(initial);
</script>

<SchemaForm
	{schema}
	{uischema}
	{value}
	{disabled}
	onChange={(next, change) => {
		value = next;
		onchange?.(next, change);
	}}
/>
