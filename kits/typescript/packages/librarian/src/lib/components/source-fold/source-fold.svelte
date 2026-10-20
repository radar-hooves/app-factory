<!--
  What an answer drew on, folded behind one line: "6 sources · 4 library · 2 web".

  It opens on the library's numbered sources and then the web pages, numbered
  on from them: the persona cites a page by its link, and the page numbers the
  link with the same chip a library source gets.
-->
<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import type { Citation } from '../../citations';
	import { fill, type ChatCopy } from '../../copy';
	import type { WebSource } from '../../web-sources';
	import SourceList from '../source-list/source-list.svelte';

	interface Props {
		library: Citation[];
		/** Pages, each with the number the answer's chip for it carries. */
		web: Array<WebSource & { n: number }>;
		words: ChatCopy;
		oncite?: (citation: Citation) => void;
		/** When the pages were read, in words ("read today"), for a page the turn read. */
		readWhen?: string;
	}

	let { library, web, words, oncite, readWhen = '' }: Props = $props();
	let open = $state(false);

	const total = $derived(library.length + web.length);

	function when(page: WebSource): string {
		if (page.date) {
			const date = new Date(page.date);
			return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
		}
		return page.read ? readWhen : '';
	}
</script>

<section class="ds-lib-fold">
	<button
		type="button"
		class="ds-lib-fold-head"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		<span class="ds-lib-fold-icons" aria-hidden="true">
			{#if library.length > 0}<span><LibraryIcon size={11} /></span>{/if}
			{#if web.length > 0}<span><GlobeIcon size={11} /></span>{/if}
		</span>
		<span class="ds-lib-fold-count">
			{total === 1 ? words.sourcesCountOne : fill(words.sourcesCount, { n: total })}
		</span>
		{#if library.length > 0 && web.length > 0}
			<span class="ds-lib-fold-split">
				{fill(words.sourcesLibrary, { n: library.length })} · {fill(words.sourcesWeb, { n: web.length })}
			</span>
		{/if}
		<span class="ds-lib-fold-chevron" aria-hidden="true">
			{#if open}<ChevronUpIcon size={15} />{:else}<ChevronDownIcon size={15} />{/if}
		</span>
	</button>

	{#if open}
		<div class="ds-lib-fold-body">
			{#if library.length > 0}
				<SourceList sources={library} {words} {oncite} heading={words.fromTheLibrary} />
			{/if}
			{#if web.length > 0}
				<section>
					<h2 class="ds-lib-fold-heading">{words.fromTheWeb}</h2>
					<ol class="ds-lib-fold-pages">
						{#each web as page (page.url)}
							<li>
								<a class="ds-lib-fold-page" href={page.url} target="_blank" rel="noopener noreferrer">
									<span class="ds-lib-fold-n">{page.n}</span>
									<span class="ds-lib-fold-page-text">
										<span class="ds-lib-fold-page-title">{page.title}</span>
										<span class="ds-lib-fold-page-meta">
											{[page.host, when(page)].filter(Boolean).join(' · ')}
										</span>
									</span>
								</a>
							</li>
						{/each}
					</ol>
				</section>
			{/if}
		</div>
	{/if}
</section>

<style>
	.ds-lib-fold-head {
		display: flex;
		min-height: 2.5rem;
		align-items: center;
		gap: 0.625rem;
		border: 0;
		background: none;
		padding: 0;
		color: var(--ds-color-muted-foreground);
		font: inherit;
		font-size: 0.875rem;
		cursor: pointer;
	}

	.ds-lib-fold-head:hover {
		color: var(--ds-color-foreground);
	}

	.ds-lib-fold-head:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-fold-icons {
		display: flex;
	}

	.ds-lib-fold-icons span {
		display: flex;
		width: 1.375rem;
		height: 1.375rem;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-full);
		background: var(--ds-color-surface-2);
	}

	.ds-lib-fold-icons span + span {
		margin-inline-start: -0.375rem;
	}

	.ds-lib-fold-count {
		color: var(--ds-color-foreground);
		font-weight: 500;
	}

	.ds-lib-fold-split {
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-fold-chevron {
		display: flex;
	}

	.ds-lib-fold-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-top: 0.5rem;
	}

	.ds-lib-fold-heading {
		margin: 0 0 0.375rem;
		color: var(--ds-color-muted-foreground);
		font-family: inherit;
		font-size: var(--ds-text-2xs);
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.ds-lib-fold-pages {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		margin: 0;
		border-top: 1px solid var(--ds-color-border);
		padding: 0.375rem 0 0;
		list-style: none;
	}

	.ds-lib-fold-page {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		border-radius: var(--ds-radius-md);
		padding: 0.375rem 0.625rem;
		color: inherit;
		font-size: 0.875rem;
		text-decoration: none;
	}

	.ds-lib-fold-page:hover {
		background: var(--ds-color-surface-2);
	}

	.ds-lib-fold-page:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-fold-n {
		flex: none;
		border-radius: var(--ds-radius-sm);
		background: color-mix(in oklab, var(--ds-color-primary) 15%, transparent);
		padding-inline: 0.375rem;
		color: var(--ds-color-foreground);
		font-family: var(--ds-font-code);
		font-size: var(--ds-text-2xs);
		font-variant-numeric: tabular-nums;
	}

	.ds-lib-fold-page-text {
		display: flex;
		min-width: 0;
		flex-direction: column;
	}

	.ds-lib-fold-page-title {
		color: var(--ds-color-foreground);
		font-weight: 500;
		overflow-wrap: anywhere;
	}

	.ds-lib-fold-page-meta {
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}
</style>
