<script lang="ts" module>
	export interface Fact {
		/**
		 * Stable identity for #each; never rendered. Also the id bound through
		 * `activeFactId`/`focusedFactId` — a consumer keys this the same way it
		 * keys the matching `PageCanvasRegion.id`, so the two lists share one
		 * key space and a single pair of bound variables ties a fact to where
		 * it is printed.
		 */
		key: string;
		/** Uppercase eyebrow label. */
		label: string;
		/** The value. A long one (a sentence, an address) spans the row. */
		value: string;
		/** Render the value in the figures' face: mono, tabular. */
		numeric?: boolean;
		/**
		 * This fact was actually placed somewhere on the page. Only then does
		 * it become pointable (hoverable, focusable, clickable); absent or
		 * false renders it as plain text, never a control that does nothing.
		 */
		hasEvidence?: boolean;
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
	//
	// An evidenced fact ties to its place on the page exactly as PageCanvas's
	// own region list does: `activeFactId` mirrors `activeRegionId` (hover or
	// keyboard focus), `focusedFactId` mirrors `focusedRegionId` (click, held
	// until clicked again). A consumer binds both pairs to the same two
	// variables — nothing FactGrid-specific lives here, it only reports and
	// accepts the same two ids PageCanvas already reads (#839).
	let {
		facts,
		activeFactId = $bindable(null),
		focusedFactId = $bindable(null),
		class: klass = '',
		ref = $bindable(null),
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		facts: Fact[];
		/** Hovered or keyboard-focused; mirrors PageCanvas's `activeRegionId`. */
		activeFactId?: string | null;
		/** Clicked, held until clicked again; mirrors `focusedRegionId`. */
		focusedFactId?: string | null;
	} = $props();

	// A sentence takes the whole row; a short value shares it with its
	// neighbours. 40 is the length the source stop-gap measured this against.
	const LONG_VALUE = 40;

	function setActive(key: string) {
		activeFactId = key;
	}
	function clearActive(key: string) {
		if (activeFactId === key) activeFactId = null;
	}
	function toggleFocus(key: string) {
		focusedFactId = focusedFactId === key ? null : key;
	}
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
				{#if fact.hasEvidence}
					<button
						type="button"
						class={cn(
							'-mx-0.5 block w-full rounded-sm px-0.5 text-left underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current focus-visible:decoration-current focus-visible:outline-none',
							(activeFactId === fact.key || focusedFactId === fact.key) &&
								'bg-primary/10 text-primary decoration-current'
						)}
						aria-pressed={focusedFactId === fact.key}
						onmouseenter={() => setActive(fact.key)}
						onmouseleave={() => clearActive(fact.key)}
						onfocus={() => setActive(fact.key)}
						onblur={() => clearActive(fact.key)}
						onclick={() => toggleFocus(fact.key)}
					>
						{fact.value}
					</button>
				{:else}
					{fact.value}
				{/if}
			</dd>
		</div>
	{/each}
</dl>
