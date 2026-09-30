<script lang="ts">
	import Input from '../input/input.svelte';
	import Textarea from '../textarea/textarea.svelte';
	import Switch from '../switch/switch.svelte';
	import Checkbox from '../checkbox/checkbox.svelte';
	import * as Select from '../select/index.js';
	import SliderField from './widgets/slider-field.svelte';
	import TagsField from './widgets/tags-field.svelte';
	import RadioField from './widgets/radio-field.svelte';
	import UnknownField from './widgets/unknown-field.svelte';
	import { enumOptions, schemaType, type WidgetChoice } from './dispatch.js';
	import type { JsonSchema } from './types.js';

	/**
	 * The widget dispatch table: one branch per `WidgetKind`, and a final `:else`
	 * that is itself the loud fallback rather than nothing. There is deliberately
	 * no silent arm in this file — that is the whole contract.
	 */
	let {
		choice,
		schema,
		value,
		id,
		name,
		label,
		scope,
		path,
		disabled = false,
		describedBy,
		onchange
	}: {
		choice: WidgetChoice;
		schema: JsonSchema;
		value: unknown;
		id: string;
		name: string;
		label: string;
		scope: string;
		path: string;
		disabled?: boolean;
		describedBy?: string;
		onchange: (next: unknown) => void;
	} = $props();

	const type = $derived(schemaType(schema));
	const options = $derived(enumOptions(schema) ?? []);
	const bounds = $derived(schema as { minimum?: number; maximum?: number; multipleOf?: number });
	const items = $derived((schema as { items?: JsonSchema }).items);

	const text = $derived(value === undefined || value === null ? '' : String(value));
	/** The string key bits-ui addresses an option by; enum values may be numbers. */
	const selected = $derived(value === undefined || value === null ? '' : String(value));

	const commitNumber = (raw: string) => {
		if (raw.trim() === '') return onchange(undefined);
		const parsed = Number(raw);
		onchange(Number.isFinite(parsed) ? parsed : raw);
	};

	const commitEnum = (key: string) => {
		const match = options.find((option) => String(option.value) === key);
		onchange(match ? match.value : key);
	};
</script>

{#if choice.widget === 'text' || choice.widget === 'password' || choice.widget === 'date' || choice.widget === 'time' || choice.widget === 'datetime'}
	<Input
		{id}
		{name}
		{disabled}
		type={choice.widget === 'datetime'
			? 'datetime-local'
			: choice.widget === 'text'
				? 'text'
				: choice.widget}
		value={text}
		aria-describedby={describedBy}
		oninput={(event) => onchange((event.currentTarget as HTMLInputElement).value)}
	/>
{:else if choice.widget === 'textarea'}
	<Textarea
		{id}
		{name}
		{disabled}
		value={text}
		aria-describedby={describedBy}
		oninput={(event) => onchange((event.currentTarget as HTMLTextAreaElement).value)}
	/>
{:else if choice.widget === 'number'}
	<Input
		{id}
		{name}
		{disabled}
		type="number"
		min={bounds.minimum}
		max={bounds.maximum}
		step={bounds.multipleOf ?? (type === 'integer' ? 1 : undefined)}
		value={text}
		aria-describedby={describedBy}
		oninput={(event) => commitNumber((event.currentTarget as HTMLInputElement).value)}
	/>
{:else if choice.widget === 'slider'}
	<SliderField
		{id}
		{disabled}
		{describedBy}
		value={typeof value === 'number' ? value : undefined}
		min={bounds.minimum ?? 0}
		max={bounds.maximum ?? 100}
		step={bounds.multipleOf ?? (type === 'integer' ? 1 : 0.01)}
		onchange={(next) => onchange(next)}
	/>
{:else if choice.widget === 'select'}
	<Select.Root type="single" value={selected} onValueChange={commitEnum} {disabled} {name}>
		<Select.Trigger {id} class="w-full" aria-describedby={describedBy}>
			{options.find((option) => String(option.value) === selected)?.label ?? 'Select…'}
		</Select.Trigger>
		<Select.Content>
			{#each options as option (String(option.value))}
				<Select.Item value={String(option.value)} label={option.label}>{option.label}</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
{:else if choice.widget === 'radio'}
	<RadioField {id} {name} {value} {options} {disabled} {describedBy} onchange={(next) => onchange(next)} />
{:else if choice.widget === 'switch'}
	<Switch
		{id}
		{name}
		{disabled}
		checked={value === true}
		aria-describedby={describedBy}
		onCheckedChange={(next: boolean) => onchange(next)}
	/>
{:else if choice.widget === 'checkbox'}
	<Checkbox
		{id}
		{name}
		{disabled}
		checked={value === true}
		aria-describedby={describedBy}
		onCheckedChange={(next: boolean) => onchange(next === true)}
	/>
{:else if choice.widget === 'tags'}
	<TagsField
		{id}
		{disabled}
		{describedBy}
		value={Array.isArray(value) ? value : undefined}
		itemType={schemaType(items) ?? 'string'}
		onchange={(next) => onchange(next)}
	/>
{:else}
	<!-- `unknown`, and the unreachable case of a WidgetKind with no branch above.
	     Both land loudly: a widget kind this file forgot is exactly the class of
	     defect that made a field vanish in the renderers this one replaces. -->
	<UnknownField
		{id}
		{label}
		{scope}
		{path}
		{value}
		{schema}
		{disabled}
		reason={choice.reason ?? 'unknown-widget'}
		detail={choice.detail ?? `no branch renders the "${choice.widget}" widget`}
		onchange={(next) => onchange(next)}
	/>
{/if}
