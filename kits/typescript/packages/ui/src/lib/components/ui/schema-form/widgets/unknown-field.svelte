<script lang="ts">
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import StatusBadge from '../../status-badge/status-badge.svelte';
	import Input from '../../input/input.svelte';
	import Label from '../../label/label.svelte';
	import type { JsonSchema, UnknownReason } from '../types.js';
	import { schemaType } from '../dispatch.js';

	/**
	 * THE LOUD FALLBACK — the reason this package exists rather than a fourth
	 * hand-rolled renderer.
	 *
	 * The estate's outgoing renderers failed silently in three ways: an
	 * unrecognised `widget` hint rendered no input, a config group missing from a
	 * hardcoded order rendered nothing at all, and a nested hint was simply
	 * inert. Every one of those made the field VANISH, and a form with a missing
	 * field looks exactly like a form. Nobody noticed for months.
	 *
	 * So there is no silent branch anywhere in `<SchemaForm>`: everything the
	 * renderer cannot dispatch lands here, and here always renders. It says what
	 * it could not do, names the pointer so the fix is a copy-paste, shows the
	 * value that would otherwise have been lost, and keeps it editable whenever
	 * editing a raw value is safe — which is when the value is a primitive. An
	 * object or an array is shown, not edited: a text box over structured data
	 * is a data-loss affordance, not a fallback.
	 */
	let {
		label,
		scope,
		path,
		reason,
		detail,
		value,
		schema,
		disabled = false,
		id,
		onchange
	}: {
		label: string;
		/** JSON Pointer this control addressed, or the property's own pointer. */
		scope: string;
		/** Dot path into the value. */
		path: string;
		reason: UnknownReason;
		/** What specifically could not be done, in one sentence. */
		detail: string;
		value: unknown;
		schema?: JsonSchema;
		disabled?: boolean;
		id: string;
		/** Emitted when the raw editor commits a primitive. */
		onchange?: (next: unknown) => void;
	} = $props();

	// Editing is offered only where a text box can round-trip the value without
	// destroying structure: a primitive, or an absent value under a primitive
	// schema. Anything structured is shown read-only.
	const declared = $derived(schemaType(schema));
	const structural = $derived(
		(value !== null && typeof value === 'object') || declared === 'object' || declared === 'array'
	);
	const editable = $derived(!structural);

	const raw = $derived(
		value === undefined || value === null
			? ''
			: typeof value === 'object'
				? JSON.stringify(value, null, 2)
				: String(value)
	);

	/** Coerce the typed text back to the schema's declared type where it can. */
	function commit(text: string) {
		if (declared === 'number' || declared === 'integer') {
			const parsed = text.trim() === '' ? undefined : Number(text);
			onchange?.(parsed !== undefined && Number.isFinite(parsed) ? parsed : text);
			return;
		}
		if (declared === 'boolean') {
			if (text === 'true' || text === 'false') return onchange?.(text === 'true');
		}
		onchange?.(text);
	}
</script>

<div
	role="group"
	aria-label="Unrecognised field: {label}"
	data-schema-form-unknown=""
	data-unknown-reason={reason}
	data-path={path}
	class="border-status-warning/50 bg-status-warning/5 grid gap-2 rounded-lg border border-dashed p-3"
>
	<div class="flex flex-wrap items-center gap-2">
		<TriangleAlert class="text-status-warning size-4 shrink-0" aria-hidden="true" />
		<span class="text-body font-semibold">{label}</span>
		<StatusBadge status="warning" label="Unrecognised control" />
	</div>

	<p class="text-muted-foreground text-xs">
		{detail}. Rendered raw and unstyled so the value is not lost, at
		<code class="font-mono">{scope}</code>
	</p>

	{#if editable}
		<Label for={id} class="text-2xs text-muted-foreground uppercase">Raw value</Label>
		<Input
			{id}
			{disabled}
			value={raw}
			class="font-mono"
			oninput={(event) => commit((event.currentTarget as HTMLInputElement).value)}
		/>
	{:else}
		<pre
			data-schema-form-unknown-readonly=""
			class="bg-surface-1 border-border text-muted-foreground max-h-48 overflow-auto rounded-md border p-2 font-mono text-xs">{raw ||
				'(no value)'}</pre>
		<p class="text-muted-foreground text-xs">
			Structured value: shown, not edited, so nothing is silently rewritten.
		</p>
	{/if}
</div>
