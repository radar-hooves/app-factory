<!--
  Rendered markdown for a streaming agent message.

  Prose styling lives here rather than in a global stylesheet because the
  content is untrusted HTML with no classes on it — every rule targets a bare
  tag, and letting those rules escape this component would restyle the whole
  consuming app.
-->
<script lang="ts">
	import { highlight, markCollections, render } from './markdown';

	interface Props {
		content: string;
		streaming?: boolean;
		/** Collection names to chip in backticks; omit if the caller has none. */
		collectionNames?: Set<string>;
	}

	let { content, streaming = false, collectionNames = new Set() }: Props = $props();
	let host = $state<HTMLElement | null>(null);

	const html = $derived(render(content, { streaming }));

	// Highlight only once the text has settled. Re-running per token would
	// re-parse grammars for a block that changes again milliseconds later.
	$effect(() => {
		if (!host || !html) return;
		// Chips are cheap and wanted DURING streaming; highlighting is not.
		markCollections(host, collectionNames);
		if (streaming) return;
		void highlight(host);
	});
</script>

<div bind:this={host} class="agent-prose text-foreground text-base leading-7">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised in render() -->
	{@html html}
</div>

<style>
	.agent-prose :global(> *:first-child) {
		margin-top: 0;
	}

	.agent-prose :global(> *:last-child) {
		margin-bottom: 0;
	}

	.agent-prose :global(p),
	.agent-prose :global(ul),
	.agent-prose :global(ol),
	.agent-prose :global(blockquote),
	.agent-prose :global(pre),
	.agent-prose :global(table) {
		margin-block: 0.75em;
	}

	.agent-prose :global(h1),
	.agent-prose :global(h2),
	.agent-prose :global(h3),
	.agent-prose :global(h4) {
		font-family: var(--ds-font-display, inherit);
		font-weight: 600;
		line-height: 1.3;
		margin-block: 1.6em 0.6em;
	}

	/* A hairline above each section. The palette's surfaces sit within ~1.2:1
	   of the page (measured, both themes), so weight and rule do the work that
	   a background tint cannot. */
	.agent-prose :global(h2) {
		border-top: 1px solid var(--border);
		padding-top: 0.8em;
	}

	.agent-prose :global(h2:first-child) {
		border-top: 0;
		padding-top: 0;
	}

	.agent-prose :global(h1) {
		font-size: 1.35em;
	}

	.agent-prose :global(h2) {
		font-size: 1.2em;
	}

	.agent-prose :global(h3) {
		font-size: 1.05em;
	}

	.agent-prose :global(h4) {
		font-size: 1em;
	}

	.agent-prose :global(ul),
	.agent-prose :global(ol) {
		padding-inline-start: 1.4em;
	}

	.agent-prose :global(ul) {
		list-style: disc;
	}

	.agent-prose :global(ol) {
		list-style: decimal;
	}

	.agent-prose :global(li) {
		margin-block: 0.3em;
	}

	.agent-prose :global(li > ul),
	.agent-prose :global(li > ol) {
		margin-block: 0.3em;
	}

	/* Lead paragraph: the answer someone could act on without reading on. */
	.agent-prose :global(> p:first-child) {
		font-size: 1.0625em;
		line-height: 1.65;
	}

	.agent-prose :global(strong) {
		font-weight: 600;
		color: var(--foreground);
	}

	.agent-prose :global(a) {
		color: var(--ds-color-primary, currentColor);
		text-underline-offset: 0.2em;
		text-decoration-line: underline;
	}

	.agent-prose :global(blockquote) {
		border-inline-start: 2px solid var(--primary);
		padding-inline: 1em 0;
		color: var(--muted-foreground);
		font-style: italic;
	}

	/* Inline code only — the fenced case is the `pre >` rule below. */

	/* Inline code carries IDENTIFIERS here — document titles, collection names,
	   requirement numbers — so it is the main way a reader picks a reference
	   out of a paragraph. Bordered rather than merely tinted, because a tint
	   alone is invisible against this palette's flat surfaces. */
	.agent-prose :global(code) {
		font-family: var(--ds-font-mono, monospace);
		font-size: 0.8125em;
		background: var(--muted);
		border: 1px solid var(--border);
		border-radius: 0.35em;
		padding: 0.1em 0.35em;
		white-space: nowrap;
	}

	.agent-prose :global(pre) {
		background: var(--muted);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.85em 1em;
		overflow-x: auto;
	}

	.agent-prose :global(pre code) {
		background: none;
		padding: 0;
		font-size: 0.8125em;
		line-height: 1.6;
	}

	/* Shiki's dual-theme output: one DOM, both colour schemes, switched by the
	   app's own theme rather than by re-highlighting. */
	.agent-prose :global(pre.shiki),
	.agent-prose :global(pre.shiki span) {
		color: var(--shiki-light);
	}

	:global(.dark) .agent-prose :global(pre.shiki),
	:global(.dark) .agent-prose :global(pre.shiki span) {
		color: var(--shiki-dark);
	}

	.agent-prose :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9em;
		display: block;
		overflow-x: auto;
	}

	.agent-prose :global(th),
	.agent-prose :global(td) {
		border: 1px solid var(--border);
		padding: 0.4em 0.6em;
		text-align: start;
	}

	.agent-prose :global(th) {
		background: var(--muted);
		font-weight: 600;
	}

	/* A collection reads as an entity rather than another monospace token when
	   the caller passes `collectionNames`. Accent-tinted rather than the flat
	   muted surface every other identifier sits on. */
	.agent-prose :global(code[data-collection]) {
		background: color-mix(in oklab, var(--primary) 16%, transparent);
		border-color: color-mix(in oklab, var(--primary) 45%, transparent);
		color: var(--foreground);
		font-weight: 500;
	}

	.agent-prose :global(hr) {
		border: 0;
		border-top: 1px solid var(--border);
		margin-block: 1.5em;
	}
</style>
