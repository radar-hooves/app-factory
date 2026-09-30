<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import Badge from '../../badge/badge.svelte';
	import Input from '../../input/input.svelte';

	/**
	 * An array of primitives as removable chips plus one entry field.
	 *
	 * Composed here because the package ships no tags input and an array of
	 * strings is the commonest non-scalar in a server-described config (allowed
	 * hosts, enabled features, ignore globs). Enter or comma commits; Backspace
	 * on an empty field removes the last chip, which is the behaviour every tags
	 * input has and the one users try first.
	 *
	 * Item coercion follows the subschema: a `number`/`integer` item schema means
	 * the array stays numeric rather than quietly becoming strings.
	 */
	let {
		id,
		value,
		itemType = 'string',
		disabled = false,
		placeholder = 'Add and press Enter',
		describedBy,
		onchange
	}: {
		id: string;
		value: unknown[] | undefined;
		itemType?: string;
		disabled?: boolean;
		placeholder?: string;
		describedBy?: string;
		onchange: (next: unknown[]) => void;
	} = $props();

	let draft = $state('');

	const items = $derived(Array.isArray(value) ? value : []);

	const coerce = (text: string): unknown => {
		if (itemType !== 'number' && itemType !== 'integer') return text;
		const parsed = Number(text);
		return Number.isFinite(parsed) ? parsed : text;
	};

	function add() {
		const text = draft.trim();
		if (!text) return;
		const next = coerce(text);
		if (!items.some((item) => item === next)) onchange([...items, next]);
		draft = '';
	}

	function removeAt(index: number) {
		onchange(items.filter((_, position) => position !== index));
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			add();
			return;
		}
		if (event.key === 'Backspace' && draft === '' && items.length) removeAt(items.length - 1);
	}
</script>

<div class="grid gap-1.5">
	{#if items.length}
		<ul class="flex flex-wrap gap-1.5" aria-label="Current values">
			{#each items as item, index (`${String(item)}-${index}`)}
				<li>
					<Badge variant="secondary" class="h-6 gap-1 pr-1">
						<span class="font-mono">{String(item)}</span>
						<button
							type="button"
							{disabled}
							aria-label="Remove {String(item)}"
							class="hover:bg-muted hover:text-foreground text-muted-foreground focus-visible:ring-ring/50 flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50"
							onclick={() => removeAt(index)}
						>
							<X class="size-3" aria-hidden="true" />
						</button>
					</Badge>
				</li>
			{/each}
		</ul>
	{/if}
	<Input
		{id}
		{disabled}
		{placeholder}
		bind:value={draft}
		aria-describedby={describedBy}
		{onkeydown}
		onblur={add}
	/>
</div>
