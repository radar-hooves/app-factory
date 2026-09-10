<!--
  What Milton answers from, and what he does not hold.

  A colleague's first question about a room is not the one they type — it is
  whether the answer they are about to read covers their case at all. Saying it
  once, in the room's own words, is cheaper than every answer hedging.

  It leads while there is nothing else on the surface, and folds to one line as
  soon as there is: a boundary a reader has already read is a banner in the way
  of the conversation they came for. Folded is not gone — the same line reopens
  it, and a reader who opened it stays opened until the surface itself changes
  state.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import InfoIcon from '@lucide/svelte/icons/info';
	import { resolveCopy, type LibrarianCopy } from '../../copy';

	interface Props {
		/** The statement itself, in the host's own words. */
		statement: string;
		/** Open on arrival. Goes false once the conversation has a first turn. */
		expanded?: boolean;
		copy?: Partial<LibrarianCopy>;
	}

	let { statement, expanded = true, copy }: Props = $props();

	const words = $derived(resolveCopy(copy));

	// `untrack`, not a bare read: capturing the ARRIVING value is the intent —
	// the effect below owns every later change — and Svelte rightly warns
	// about a prop read in a position that will never see one.
	let open = $state(untrack(() => expanded));
	// Plain, not `$state`: the effect below both reads and writes it, and
	// nothing renders it. It exists so the effect fires on a CHANGE of the
	// prop rather than on every re-render — a reader who opened the statement
	// back up mid-conversation keeps it open until the surface itself moves on.
	let followed = untrack(() => expanded);
	$effect(() => {
		if (expanded === followed) return;
		followed = expanded;
		open = expanded;
	});
</script>

<section
	class="border-border bg-surface-2/60 rounded-xl border px-3 py-2"
	aria-label={words.scope}
>
	<button
		type="button"
		onclick={() => (open = !open)}
		aria-expanded={open}
		class="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex w-full items-center gap-2 rounded-md text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
	>
		<InfoIcon class="size-3.5 shrink-0" />
		<span class="min-w-0 flex-1 truncate font-medium tracking-wide uppercase">{words.scope}</span>
		<ChevronDownIcon class="size-3.5 shrink-0 transition-transform {open ? 'rotate-180' : ''}" />
	</button>

	{#if open}
		<!-- No measure of its own: the card IS the measure, and a paragraph
		     capped narrower than the border around it leaves a hand's width of
		     empty card down the right at 1440. -->
		<p class="text-muted-foreground mt-1.5 text-sm leading-6 whitespace-pre-line">
			{statement}
		</p>
	{/if}
</section>
