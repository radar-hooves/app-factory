<!--
  What this room answers from, and what it does not hold.

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

<section class="ds-lib-scope" aria-label={words.scope}>
	<button
		type="button"
		class="ds-lib-scope-toggle"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		<InfoIcon size={14} />
		<span class="ds-lib-scope-label">{words.scope}</span>
		<span class="ds-lib-scope-chevron" class:is-open={open}>
			<ChevronDownIcon size={14} />
		</span>
	</button>

	{#if open}
		<!-- No measure of its own: the card IS the measure, and a paragraph
		     capped narrower than the border around it leaves a hand's width of
		     empty card down the right at 1440. -->
		<p class="ds-lib-scope-text">{statement}</p>
	{/if}
</section>

<style>
	.ds-lib-scope {
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-xl);
		background: color-mix(in oklab, var(--ds-color-surface-2) 60%, transparent);
		padding: 0.5rem 0.75rem;
	}

	.ds-lib-scope-toggle {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.5rem;
		border: 0;
		border-radius: var(--ds-radius-md);
		background: none;
		padding: 0;
		color: var(--ds-color-muted-foreground);
		font: inherit;
		font-size: var(--ds-text-2xs);
		text-align: start;
		cursor: pointer;
		transition: color 150ms ease;
	}

	.ds-lib-scope-toggle:hover {
		color: var(--ds-color-foreground);
	}

	.ds-lib-scope-toggle:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-scope-label {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.ds-lib-scope-chevron {
		display: flex;
		flex: none;
		transition: transform 150ms ease;
	}

	.ds-lib-scope-chevron.is-open {
		transform: rotate(180deg);
	}

	.ds-lib-scope-text {
		margin: 0.375rem 0 0;
		color: var(--ds-color-muted-foreground);
		font-size: 0.875rem;
		line-height: 1.5rem;
		white-space: pre-line;
	}

	@media (prefers-reduced-motion: reduce) {
		.ds-lib-scope-chevron {
			transition: none;
		}
	}
</style>
