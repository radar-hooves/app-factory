<!--
  One fenced block of a language the host has a renderer for.

  While its closing fence has not arrived the block is a placeholder: half a
  JSON document is not a chart. A closed block is parsed by its renderer, and
  one that will not parse is shown as the code it was, never a blank.
-->
<script lang="ts">
	import type { ChatCopy } from '../../copy';
	import type { Visual } from '../../visuals';

	interface Props {
		lang: string;
		visual: Visual;
		source: string;
		closed: boolean;
		streaming: boolean;
		words: ChatCopy;
	}

	let { lang, visual, source, closed, streaming, words }: Props = $props();

	const drawn = $derived.by(() => {
		if (!closed) return null;
		try {
			return { value: visual.parse(source) };
		} catch {
			return null;
		}
	});
	const Drawing = $derived(visual.component);
</script>

{#if !closed && streaming}
	<p class="ds-lib-drawing" role="status">{words.drawing}</p>
{:else if drawn}
	<Drawing value={drawn.value} {source} />
{:else}
	<!-- Marked, so the highlighter that follows the prose leaves what this owns. -->
	<pre data-highlighted="true"><code class="language-{lang}">{source}</code></pre>
{/if}

<style>
	.ds-lib-drawing {
		margin: 0.75em 0;
		border: 1px dashed var(--ds-color-border);
		border-radius: var(--ds-radius-lg);
		padding: 1.25rem 1rem;
		color: var(--ds-color-muted-foreground);
		font-size: 0.875rem;
		text-align: center;
	}
</style>
