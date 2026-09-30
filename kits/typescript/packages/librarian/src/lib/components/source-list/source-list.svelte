<!--
  What an answer cited, as a list a reader can open.

  One component rather than the same twenty lines in the transcript and again
  in the artefact pane: the trust mark, the number chip and the disabled state
  of a citation with no document behind it are one decision, and two copies of
  it is two places for them to drift apart.
-->
<script lang="ts">
	import { trustMark, type Citation } from '../../citations';
	import type { LibrarianCopy } from '../../copy';

	interface Props {
		sources: Citation[];
		words: LibrarianCopy;
		/** Opens the document. Omit and the rows list but do not open. */
		oncite?: (citation: Citation) => void;
		/** `h2` in a transcript turn, `h3` under the artefact's own title. */
		level?: 2 | 3;
	}

	let { sources, words, oncite, level = 2 }: Props = $props();
</script>

<section class="ds-lib-sources">
	{#if level === 2}
		<h2 class="ds-lib-sources-heading">{words.sources}</h2>
	{:else}
		<h3 class="ds-lib-sources-heading">{words.sources}</h3>
	{/if}
	<ol class="ds-lib-sources-list">
		{#each sources as source (source.n)}
			{@const mark = trustMark(source, words)}
			<li>
				<button
					type="button"
					class="ds-lib-source"
					onclick={() => oncite?.(source)}
					disabled={!source.document_id || !oncite}
				>
					<span class="ds-lib-source-n">{source.n}</span>
					<span class="ds-lib-source-text">
						<span class="ds-lib-source-title">{source.title}</span>
						{#if source.section}<span class="ds-lib-source-section"> · {source.section}</span>{/if}
						<!-- Same muted register as the section, deliberately. An
						     unverified source is not an error and must not be dressed
						     as one; the words carry the difference, and a red one
						     would have a colleague discount a document that is
						     simply new. -->
						{#if mark}<span class="ds-lib-source-mark"> · {mark}</span>{/if}
					</span>
				</button>
			</li>
		{/each}
	</ol>
</section>

<style>
	.ds-lib-sources-heading {
		margin: 0 0 0.375rem;
		color: var(--ds-color-muted-foreground);
		font-family: inherit;
		font-size: var(--ds-text-2xs);
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.ds-lib-sources-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.ds-lib-source {
		display: flex;
		width: 100%;
		align-items: baseline;
		gap: 0.5rem;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-lg);
		background: none;
		padding: 0.375rem 0.625rem;
		color: inherit;
		font: inherit;
		font-size: 0.875rem;
		text-align: start;
		cursor: pointer;
		transition:
			background-color 150ms ease,
			border-color 150ms ease;
	}

	.ds-lib-source:hover:not(:disabled) {
		border-color: var(--ds-color-border-strong);
		background: var(--ds-color-surface-2);
	}

	.ds-lib-source:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-source:disabled {
		cursor: default;
	}

	.ds-lib-source-n {
		flex: none;
		border-radius: var(--ds-radius-sm);
		background: color-mix(in oklab, var(--ds-color-primary) 15%, transparent);
		padding-inline: 0.375rem;
		color: var(--ds-color-foreground);
		font-family: var(--ds-font-code);
		font-size: var(--ds-text-2xs);
		font-variant-numeric: tabular-nums;
	}

	.ds-lib-source-text {
		min-width: 0;
	}

	.ds-lib-source-title {
		color: var(--ds-color-foreground);
	}

	.ds-lib-source-section {
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-source-mark {
		color: color-mix(in oklab, var(--ds-color-muted-foreground) 80%, transparent);
	}
</style>
