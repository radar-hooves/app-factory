<script lang="ts" module>
	export interface Fact {
		/** Stable identity for #each; never rendered. */
		key: string;
		/** Uppercase eyebrow label. */
		label: string;
		/** The value. A long one (a sentence, an address) spans the row. */
		value: string;
		/** Render the value in the figures' face: mono, tabular. */
		numeric?: boolean;
	}
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	// A document's key facts read at a glance, INSIDE whatever card already
	// holds them — eyebrow label over value, wrapped into a responsive grid,
	// with no border or title of its own. StatList is this same situation as
	// a titled card for the context column; reach for FactGrid instead where
	// a Panel or DetailPanel already supplies the box, so nesting never
	// doubles the border (godswood's FactGrid stop-gap, #839).
	let {
		facts,
		class: klass = '',
		ref = $bindable(null),
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		facts: Fact[];
	} = $props();

	// A sentence takes the whole row; a short value shares it with its
	// neighbours. 40 is the length the source stop-gap measured this against.
	const LONG_VALUE = 40;
</script>

<dl
	bind:this={ref}
	class={cn('grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-4', klass)}
	{...restProps}
>
	{#each facts as fact (fact.key)}
		<div class={cn('min-w-0', fact.value.length > LONG_VALUE && 'col-span-full')}>
			<dt class="text-muted-foreground text-2xs tracking-eyebrow font-medium uppercase">
				{fact.label}
			</dt>
			<dd class={cn('mt-1 break-words', fact.numeric && 'font-mono tabular-nums')}>
				{fact.value}
			</dd>
		</div>
	{/each}
</dl>
