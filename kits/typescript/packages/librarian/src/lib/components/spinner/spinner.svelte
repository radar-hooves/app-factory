<!--
  The glyph that says something is happening: Claude Code's own, a star that
  grows and shrinks through six shapes at one steady beat. It changes shape,
  never brightness, so it reads as motion rather than as a light flashing;
  with reduced motion asked for it holds one shape.
-->
<script lang="ts">
	/** Claude Code's spinner, there and back again so it never jumps. */
	const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
	/** The shape it holds when motion is not wanted. */
	const STILL = 4;
	const BEAT_MS = 120;

	let frame = $state(STILL);

	$effect(() => {
		if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
		frame = 0;
		const timer = setInterval(() => (frame = (frame + 1) % FRAMES.length), BEAT_MS);
		return () => clearInterval(timer);
	});
</script>

<span class="ds-lib-spinner" aria-hidden="true">{FRAMES[frame]}</span>

<style>
	/* A fixed box, so a wider shape never nudges the words beside it. */
	.ds-lib-spinner {
		display: inline-flex;
		width: 1em;
		flex: none;
		justify-content: center;
		color: var(--ds-color-primary);
		font-family: var(--ds-font-code);
		line-height: 1;
	}
</style>
