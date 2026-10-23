<!--
  One tool call, as a row in the turn's steps.

  Not a card: the kind of step as an icon, an action in bold, its target
  beside it, and at the right hand what the result counted ("9 passages") and
  a chevron. While the call runs the icon is the turning glyph and the action
  is in the present ("Searching the library for"); its result turns it to
  the past ("Searched the library for … 9 passages"). The row says what the persona DID, in a reader's own words — never
  the tool's name or the raw command it ran: the host's `DescribeTool`, or the
  package's own `describe()`. Expanding it shows what went in and what came
  back, the way Claude Code's own panel does; a web search shows the pages it
  found instead, as small cards.
-->
<script lang="ts">
	import BookOpenTextIcon from '@lucide/svelte/icons/book-open-text';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import FilePenIcon from '@lucide/svelte/icons/file-pen';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { describe, type ToolBlock, type ToolWords } from '../../transcript.svelte';
	import { resolveCopy, type ChatCopy } from '../../copy';
	import { stepKind, stepMeta, type StepKind } from '../../steps';
	import { searchPages } from '../../web-sources';
	import Spinner from '../spinner/spinner.svelte';

	interface Props {
		block: ToolBlock;
		running: boolean;
		/** The call in the persona's words. Absent takes the package's own. */
		words?: ToolWords;
		copy?: Partial<ChatCopy>;
	}

	let { block, running, words, copy }: Props = $props();
	let open = $state(false);

	const ICONS = {
		attachment: FileTextIcon,
		library: LibraryIcon,
		web: GlobeIcon,
		open: BookOpenTextIcon,
		write: FilePenIcon,
		edit: PencilIcon,
		thought: CircleIcon,
		other: CircleIcon
	} satisfies Record<StepKind, unknown>;

	const label = $derived(resolveCopy(copy));
	const settled = $derived(block.result !== undefined);
	const said = $derived(words ?? describe(block));
	const Icon = $derived(ICONS[stepKind(block)]);
	const meta = $derived(stepMeta(block, label));
	const pages = $derived(searchPages(block));
	const tone = $derived(block.isError ? 'error' : settled ? 'success' : 'info');
	const live = $derived(!settled && running);
	const verb = $derived(live ? (said.doing ?? said.verb) : said.verb);
	// Pretty while it parses; the raw text while it is still arriving.
	const input = $derived.by(() => {
		try {
			const parsed: unknown = JSON.parse(block.rawInput);
			return typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length === 0
				? ''
				: JSON.stringify(parsed, null, 2);
		} catch {
			return block.rawInput;
		}
	});
</script>

<div class="ds-lib-tool">
	<button
		type="button"
		class="ds-lib-tool-row"
		onclick={() => (open = !open)}
		aria-expanded={open}
	>
		<span class="ds-lib-tool-icon" data-tone={tone} aria-hidden="true">
			{#if live}<Spinner />{:else}<Icon size={14} />{/if}
		</span>
		<span class="ds-lib-tool-said">
			<span class="ds-lib-tool-verb">{verb}</span>
			{#if said.object}<span class="ds-lib-tool-object">{said.object}</span>{/if}
		</span>
		{#if block.isError}<span class="ds-lib-tool-failed">{label.stepFailed}</span>{/if}
		{#if meta}<span class="ds-lib-tool-meta">{meta}</span>{/if}
		<span class="ds-lib-tool-chevron" class:is-open={open} aria-hidden="true">
			<ChevronRightIcon size={14} />
		</span>
	</button>

	{#if open}
		<div class="ds-lib-tool-body">
			{#if pages.length > 0}
				<ul class="ds-lib-tool-pages">
					{#each pages as page (page.url)}
						<li>
							<a class="ds-lib-tool-page" href={page.url} target="_blank" rel="noopener noreferrer">
								<span class="ds-lib-tool-page-host"><GlobeIcon size={11} />{page.host}</span>
								<span class="ds-lib-tool-page-title">{page.title}</span>
								{#if page.snippet}<span class="ds-lib-tool-page-snippet">{page.snippet}</span>{/if}
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				{#if input}
					<p class="ds-lib-tool-label">{label.stepInput}</p>
					<pre class="ds-lib-tool-result">{input}</pre>
				{/if}
				{#if block.result}
					<p class="ds-lib-tool-label">{label.stepResult}</p>
					<pre class="ds-lib-tool-result">{block.result}</pre>
				{/if}
			{/if}
		</div>
	{:else if said.detail}
		<p class="ds-lib-tool-lines">{said.detail}</p>
	{/if}
</div>

<style>
	.ds-lib-tool {
		font-size: 0.875rem;
		line-height: 1.25rem;
	}

	.ds-lib-tool-row {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.625rem;
		padding-block: 0.25rem;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;
	}

	.ds-lib-tool-icon {
		display: flex;
		width: 14px;
		flex: none;
		justify-content: center;
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-tool-icon[data-tone='error'] {
		color: var(--ds-color-status-error);
	}

	.ds-lib-tool-chevron {
		display: flex;
		flex: none;
		color: var(--ds-color-muted-foreground);
		transition: transform 150ms ease;
	}

	.ds-lib-tool-chevron.is-open {
		transform: rotate(90deg);
	}

	.ds-lib-tool-meta {
		flex: none;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
		font-variant-numeric: tabular-nums;
	}

	.ds-lib-tool-pages {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.ds-lib-tool-page {
		display: flex;
		height: 100%;
		flex-direction: column;
		gap: 0.125rem;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-md);
		padding: 0.5rem 0.625rem;
		color: inherit;
		font-size: var(--ds-text-2xs);
		line-height: 1.35;
		text-decoration: none;
	}

	.ds-lib-tool-page:hover {
		background: var(--ds-color-surface-2);
	}

	.ds-lib-tool-page:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-tool-page-host {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-tool-page-title {
		color: var(--ds-color-foreground);
		font-size: 0.8125rem;
		font-weight: 600;
	}

	.ds-lib-tool-page-snippet {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		overflow: hidden;
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-tool-said {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-tool-verb {
		color: var(--ds-color-foreground);
		font-weight: 500;
	}

	.ds-lib-tool-object {
		color: color-mix(in oklab, var(--ds-color-foreground) 80%, transparent);
	}

	.ds-lib-tool-body {
		margin-top: 0.25rem;
		margin-inline-start: 0.4375rem;
		border-inline-start: 1px solid var(--ds-color-border);
		padding-inline-start: 1rem;
	}

	.ds-lib-tool-result {
		margin: 0.125rem 0 0;
		max-height: 12rem;
		overflow: auto;
		color: var(--ds-color-muted-foreground);
		font-family: var(--ds-font-code);
		font-size: var(--ds-text-2xs);
		white-space: pre-wrap;
	}

	.ds-lib-tool-label {
		margin: 0.25rem 0 0;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.ds-lib-tool-failed {
		flex: none;
		color: var(--ds-color-status-error);
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-tool-lines {
		margin: 0;
		padding-inline-start: 1.5rem;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}

	@media (prefers-reduced-motion: reduce) {
		.ds-lib-tool-chevron {
			transition: none;
		}
	}
</style>
