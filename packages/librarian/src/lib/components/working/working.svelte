<!--
  Something is happening, and you can see it.

  The CLI takes ~2.6s to boot before its first event and the model another
  ~1.5s to its first token, so a naive transcript shows NOTHING for about four
  seconds. Measured, and the operator counted it out loud. The lag itself is
  mostly not ours to remove; a screen that visibly does nothing is.

  Two moving parts, deliberately: a word that changes so the page is evidently
  alive, and a clock that only goes up so a long wait still reads as progress
  rather than as a hang.
-->
<script lang="ts">
	interface Props {
		/** Shown instead of the cycling word once real work is identifiable. */
		label?: string;
	}

	let { label }: Props = $props();

	const WORDS = [
		'Starting',
		'Reading the shelves',
		'Rummaging',
		'Cross-checking',
		'Thumbing pages',
		'Following a reference',
		'Chasing it down'
	];

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

	const word = $derived(label ?? WORDS[tick % WORDS.length]);
</script>

<div class="text-muted-foreground flex items-center gap-2 text-sm">
	<span class="bg-status-info size-1.5 animate-pulse rounded-full"></span>
	<span>{word}…</span>
	<span class="text-muted-foreground/70 font-mono text-xs tabular-nums">{elapsed}s</span>
</div>
