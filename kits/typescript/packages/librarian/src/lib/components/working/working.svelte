<!--
  Something is happening, and you can see it: the one live line under a turn
  while it runs, as Claude Code draws its own.

  The CLI takes ~2.6s to boot before its first event and the model another
  ~1.5s to its first token, so a naive transcript shows NOTHING for about four
  seconds. Measured, and the operator counted it out loud. The lag itself is
  mostly not ours to remove; a screen that visibly does nothing is.

  Three moving parts and a way out: a glyph that turns at one steady beat, one
  plain verb for what is happening now (the host's, from `activityNow`), a
  clock that only goes up so a long wait still reads as progress rather than
  as a hang, and Stop. The verb changes when the work does, never on a timer:
  words swapping on their own read as a light flashing (operator, 24/10/2026).
-->
<script lang="ts">
	import { resolveCopy, type ChatCopy } from '../../copy';
	import Spinner from '../spinner/spinner.svelte';

	interface Props {
		/** What is happening now, in one plain verb. Absent, `copy.working`. */
		label?: string;
		/** When the answer began, epoch ms, for one this page did not see start:
		 *  the clock counts from it rather than from the moment it appeared. */
		since?: number;
		/** Stops the answer. Omit and no Stop renders. */
		onstop?: () => void;
		/** The persona's words. Resolved from `name` upstream. */
		copy?: Partial<ChatCopy>;
	}

	let { label, since, onstop, copy }: Props = $props();

	const words = $derived(resolveCopy(copy));

	const mounted = Date.now();
	let now = $state(mounted);
	const elapsed = $derived(Math.max(0, Math.floor((now - (since ?? mounted)) / 1000)));

	$effect(() => {
		const clock = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(clock);
	});

	// One ellipsis, whether the words brought their own or not.
	const said = $derived(`${(label ?? words.working).replace(/…$/, '')}…`);
</script>

<div class="ds-lib-working">
	<Spinner />
	<span class="ds-lib-working-said">{said}</span>
	<span class="ds-lib-working-clock">{elapsed}s</span>
	{#if onstop}
		<button type="button" class="ds-lib-working-stop" onclick={onstop}>{words.stop}</button>
	{/if}
</div>

<style>
	.ds-lib-working {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		color: var(--ds-color-muted-foreground);
		font-size: 0.875rem;
		line-height: 1.25rem;
	}

	.ds-lib-working-said {
		color: var(--ds-color-foreground);
	}

	.ds-lib-working-clock {
		font-family: var(--ds-font-code);
		font-size: var(--ds-text-2xs);
		font-variant-numeric: tabular-nums;
		opacity: 0.7;
	}

	.ds-lib-working-stop {
		border: 0;
		border-radius: var(--ds-radius-sm);
		background: none;
		padding: 0 0.25rem;
		color: var(--ds-color-muted-foreground);
		font: inherit;
		font-size: var(--ds-text-2xs);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}

	.ds-lib-working-stop:hover {
		color: var(--ds-color-foreground);
	}

	.ds-lib-working-stop:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	@media (pointer: coarse) {
		.ds-lib-working-stop {
			min-height: 2.75rem;
			padding-inline: 0.5rem;
		}
	}
</style>
