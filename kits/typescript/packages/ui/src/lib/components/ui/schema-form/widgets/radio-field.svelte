<script lang="ts">
	import Label from '../../label/label.svelte';

	/**
	 * A closed value set as a visible row of choices, for the case where a select
	 * hides the options a user needs to compare. Composed here for the same
	 * reason as the slider: the package ships no radio group, and its only caller
	 * is an enum Control that asked for `options.format: "radio"`.
	 *
	 * Native inputs, one `name` per field, so arrow-key roving and the radiogroup
	 * role come from the platform rather than from markup that has to be right.
	 */
	let {
		id,
		name,
		value,
		options,
		disabled = false,
		describedBy,
		onchange
	}: {
		id: string;
		name: string;
		value: unknown;
		options: { value: unknown; label: string }[];
		disabled?: boolean;
		describedBy?: string;
		onchange: (next: unknown) => void;
	} = $props();
</script>

<div {id} role="radiogroup" aria-labelledby="{id}-label" aria-describedby={describedBy} class="flex flex-wrap gap-x-4 gap-y-2">
	{#each options as option, index (String(option.value))}
		<div class="flex items-center gap-1.5">
			<input
				id="{id}-{index}"
				{name}
				{disabled}
				type="radio"
				value={String(option.value)}
				checked={option.value === value}
				class="accent-primary focus-visible:ring-ring/50 size-4 outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
				onchange={() => onchange(option.value)}
			/>
			<Label for="{id}-{index}" class="font-normal">{option.label}</Label>
		</div>
	{/each}
</div>
