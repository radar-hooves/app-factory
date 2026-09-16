<!--
  Something is happening, and you can see it.

  The CLI takes ~2.6s to boot before its first event and the model another
  ~1.5s to its first token, so a naive transcript shows NOTHING for about four
  seconds. Measured, and the operator counted it out loud. The lag itself is
  mostly not ours to remove; a screen that visibly does nothing is.

  Two moving parts, deliberately: a word that changes so the page is evidently
  alive, and a clock that only goes up so a long wait still reads as progress
  rather than as a hang. The words name whoever is answering — they came from
  `copy`, which the host's `name` composed, so this component knows no persona.
-->
<script lang="ts">
	import { resolveCopy, type LibrarianCopy } from '../../copy';

	interface Props {
		/** Shown instead of the cycling word once real work is identifiable. */
		label?: string;
		/** The persona's words. Resolved from `name` upstream. */
		copy?: Partial<LibrarianCopy>;
	}

	let { label, copy }: Props = $props();

	const words = $derived(resolveCopy(copy));

	let tick = $state(0);
	let elapsed = $state(0);

	$effect(() => {
		const word = setInterval(() => (tick += 1), 2600);
		const clock = setInterval(() => (elapsed += 1), 1000);
		return () => {
			clearInterval(word);
			clearInterval(clock);
		};
	});

	const word = $derived(label ?? words.working[tick % words.working.length]);
</script>

<div class="ds-lib-working">
	<span class="ds-lib-working-dot"></span>
	<span>{word}…</span>
	<span class="ds-lib-working-clock">{elapsed}s</span>
</div>

<style>
	.ds-lib-working {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--ds-color-muted-foreground);
		font-size: 0.875rem;
		line-height: 1.25rem;
	}

	.ds-lib-working-dot {
		width: 0.375rem;
		height: 0.375rem;
		flex: none;
		border-radius: var(--ds-radius-full);
		background: var(--ds-color-status-info);
		animation: ds-lib-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	.ds-lib-working-clock {
		font-family: var(--ds-font-code);
		font-size: var(--ds-text-2xs);
		font-variant-numeric: tabular-nums;
		opacity: 0.7;
	}

	@keyframes ds-lib-pulse {
		50% {
			opacity: 0.4;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ds-lib-working-dot {
			animation: none;
		}
	}
</style>
