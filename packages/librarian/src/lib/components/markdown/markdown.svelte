<!--
  Rendered markdown for a streaming agent message.

  Prose styling lives here rather than in a global stylesheet because the
  content is untrusted HTML with no classes on it — every rule targets a bare
  tag, and letting those rules escape this component would restyle the whole
  consuming app.
-->
<script lang="ts">
	import { highlight, markCitations, markCollections, render } from './markdown';

	interface Props {
		content: string;
		streaming?: boolean;
		/** Collection names to chip in backticks; omit if the caller has none. */
		collectionNames?: Set<string>;
		/** `[n]` markers to turn into chips; omit and the markers stay as text. */
		citationNumbers?: Set<number>;
		oncite?: (n: number) => void;
	}

	let {
		content,
		streaming = false,
		collectionNames = new Set(),
		citationNumbers = new Set(),
		oncite
	}: Props = $props();
	let host = $state<HTMLElement | null>(null);

	const html = $derived(render(content, { streaming }));

	// Highlight only once the text has settled. Re-running per token would
	// re-parse grammars for a block that changes again milliseconds later.
	$effect(() => {
		if (!host || !html) return;
		// Chips are cheap and wanted DURING streaming; highlighting is not.
		markCollections(host, collectionNames);
		markCitations(host, citationNumbers);
		if (streaming) return;
		void highlight(host);
	});

	// Delegated, because the chips are created by the sanitiser's output rather
	// than by this template — there is no element here to put a handler on.
	function citeFrom(target: EventTarget | null): number | null {
		const chip = (target as HTMLElement | null)?.closest?.('[data-cite]');
		const n = Number((chip as HTMLElement | undefined)?.dataset.cite);
		return Number.isFinite(n) && n > 0 ? n : null;
	}

	function click(event: MouseEvent) {
		const n = citeFrom(event.target);
		if (n !== null) oncite?.(n);
	}

	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		const n = citeFrom(event.target);
		if (n === null) return;
		event.preventDefault();
		oncite?.(n);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -- the interactive
     elements are the sanitiser-created chips, which carry role and tabindex;
     this element only delegates their events. -->
<div
	bind:this={host}
	onclick={click}
	onkeydown={keydown}
	class="agent-prose text-foreground text-base leading-7"
>
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
	/* Inline, in running text: wraps at word boundaries like the prose around it
	   rather than scrolling in its own box — that pattern is reserved for wide
	   BLOCK content (a table, a fenced code block) that a reader scrolls past;
	   an inline identifier a reader is reading stays in flow. A long citation
	   title is exactly the case: nowrap clipped it at the container edge on a
	   phone with no way to read the rest. */
	.agent-prose :global(code) {
		font-family: var(--ds-font-mono, monospace);
		font-size: 0.8125em;
		background: var(--muted);
		border: 1px solid var(--border);
		border-radius: 0.35em;
		padding: 0.1em 0.35em;
		white-space: normal;
		overflow-wrap: anywhere;
	}

	.agent-prose :global(pre) {
		background: var(--muted);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.85em 1em;
		overflow-x: auto;
		/* A fenced block is the one thing here allowed to be wider than the
		   measure, so it must scroll INSIDE itself: without this a 90-column
		   line makes the whole transcript scroll sideways at 390px. */
		max-width: 100%;
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

	/* `display: block` is what makes the overflow scroll: a real `table` box
	   ignores overflow-x and widens its container instead. */
	.agent-prose :global(table) {
		width: 100%;
		max-width: 100%;
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
		/* A cell must not be squeezed to one character per line by a narrow
		   viewport; the table scrolls instead. */
		white-space: nowrap;
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

	/* The citation chip. A superscript number a reader can press: small enough
	   to sit inside a sentence without breaking its rhythm, big enough that a
	   thumb finds it — the padding, not the glyph, carries the target size. */
	.agent-prose :global(sup.ds-cite) {
		display: inline-block;
		min-width: 1.35em;
		margin-inline: 0.15em;
		padding: 0.1em 0.3em;
		border-radius: 0.4em;
		background: color-mix(in oklab, var(--primary) 16%, transparent);
		color: var(--foreground);
		font-family: var(--ds-font-mono, monospace);
		font-size: 0.7em;
		font-weight: 600;
		line-height: 1.4;
		text-align: center;
		vertical-align: 0.35em;
		cursor: pointer;
	}

	.agent-prose :global(sup.ds-cite:hover) {
		background: color-mix(in oklab, var(--primary) 30%, transparent);
	}

	.agent-prose :global(sup.ds-cite:focus-visible) {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.agent-prose :global(hr) {
		border: 0;
		border-top: 1px solid var(--border);
		margin-block: 1.5em;
	}
</style>
