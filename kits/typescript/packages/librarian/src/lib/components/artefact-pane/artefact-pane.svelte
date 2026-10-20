<!--
  An artefact that is its answer's own prose, or one version of a document the
  persona wrote, open in the reading column.

  A written document is shown from its source: Markdown through the package's
  sanitising renderer, HTML only inside a sandboxed frame with no permissions
  (no scripts, no same origin), never injected into the page.

  The same shell shape `DocumentPane` uses (a column at 64rem, a bottom sheet
  below it) because decision 2 of the agent surface is that a colleague never
  has to learn which of the two things is in the column before they open it —
  only ever one, in the same place, closing whichever was there.
-->
<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import CheckIcon from '@lucide/svelte/icons/check';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import XIcon from '@lucide/svelte/icons/x';
	import { untrack } from 'svelte';
	import { segment, type TextBlock, type Turn } from '../../transcript.svelte';
	import { resolveCitations, splitSources, type Citation } from '../../citations';
	import { fill, resolveCopy, type ChatCopy } from '../../copy';
	import {
		downloads,
		framed,
		isHtml,
		kindLabel,
		stripFrontMatter,
		writtenKey,
		type LoadWritten,
		type Written,
		type WrittenUrl
	} from '../../written';
	import Markdown from '../markdown/markdown.svelte';
	import SourceList from '../source-list/source-list.svelte';


	interface Props {
		/** The turn whose answer is the artefact. Absent when `versions` is given. */
		turn?: Turn;
		/** Every version of one written document, oldest first: the pane shows
		 *  `version` of them, with a switcher. */
		versions?: Written[];
		version?: number;
		onversion?: (version: number) => void;
		loadWritten?: LoadWritten;
		writtenUrl?: WrittenUrl;
		onclose: () => void;
		/** Opens the cited document instead — swapping the column back, never
		 *  stacking it beside the artefact. Omit and the sources still list, but
		 *  do not open. */
		oncite?: (citation: Citation) => void;
		copy?: Partial<ChatCopy>;
	}

	let {
		turn,
		versions = [],
		version,
		onversion,
		loadWritten,
		writtenUrl,
		onclose,
		oncite,
		copy
	}: Props = $props();

	const words = $derived(resolveCopy(copy));

	// The newest, until the reader picks another.
	const current = $derived(versions.find((v) => v.version === version) ?? versions.at(-1));
	const currentKey = $derived(current ? writtenKey(current) : '');
	// The one before it, whose blocks this one is marked against.
	const before = $derived(current ? versions.filter((v) => v.version < current.version).at(-1) : undefined);
	const beforeKey = $derived(before ? writtenKey(before) : '');
	let source = $state<{ text: string; mediaType: string } | null>(null);
	let earlier = $state<string | null>(null);
	let failed = $state(false);

	// Keyed on the version alone: a new version of the same name arriving in
	// the stream must not read this one again.
	$effect(() => {
		if (!currentKey) return;
		const shown = untrack(() => current);
		const load = untrack(() => loadWritten);
		if (!shown || !load) return;
		let live = true;
		source = null;
		failed = false;
		load(shown.name, shown.version).then(
			(read) => live && (source = read),
			() => live && (failed = true)
		);
		return () => (live = false);
	});

	$effect(() => {
		earlier = null;
		if (!beforeKey) return;
		const prior = untrack(() => before);
		const load = untrack(() => loadWritten);
		if (!prior || !load || isHtml(prior.media_type)) return;
		let live = true;
		// A version that cannot be read is no reason to mark nothing else.
		load(prior.name, prior.version).then(
			(read) => live && (earlier = stripFrontMatter(read.text)),
			() => {}
		);
		return () => (live = false);
	});

	const texts = $derived(
		segment(turn?.blocks ?? []).filter((s): s is TextBlock => s.kind === 'text')
	);
	const rawAnswer = $derived(texts.map((t) => t.text).join('\n\n'));
	const split = $derived(splitSources(rawAnswer));
	const sources = $derived(resolveCitations(turn?.citations ?? [], split.citations));

	const links = $derived(current && writtenUrl ? downloads(current, words) : []);
	// The one download the bar offers directly: Word where there is one, else the source.
	const primary = $derived(links.find((link) => link.format === 'docx') ?? links[0]);
	const sub = $derived.by(() => {
		if (!current) return '';
		const fresh = current.at !== undefined && Date.now() - current.at < 120_000;
		const when = fresh
			? fill(current.version > 1 ? words.paneEdited : words.paneWritten, { when: words.justNow })
			: '';
		return [kindLabel(current, words), when].filter(Boolean).join(' · ');
	});
	const changed = $derived(
		current?.changes && before
			? fill(words.changedSince, { n: before.version, changes: current.changes })
			: ''
	);

	let menu = $state(false);
	let copied = $state(false);

	async function copyDocument() {
		if (!source) return;
		try {
			await navigator.clipboard.writeText(stripFrontMatter(source.text));
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			// A denied clipboard is not worth an error state on text the reader can select.
		}
	}

	let closeButton = $state<HTMLButtonElement | null>(null);

	// Opening a pane a reader reached with the keyboard must move focus into
	// it, or Escape and Tab both act on the transcript behind it.
	$effect(() => {
		const returnTo = globalThis.document?.activeElement as HTMLElement | null;
		closeButton?.focus();
		return () => returnTo?.focus?.();
	});

	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.stopPropagation();
		if (menu) menu = false;
		else onclose();
	}
</script>

<svelte:window onkeydown={keydown} />

<aside aria-label={current?.title ?? 'Study artefact'} class="ds-lib-pane">
	<!-- The sheet's grabber. On a phone this is an overlay a reader has to be
	     able to see the top edge of; on a desktop it is a column, so there is
	     nothing here to grab. -->
	<div class="ds-lib-pane-grabber" aria-hidden="true"><span></span></div>

	<header class="ds-lib-pane-header">
		<button
			bind:this={closeButton}
			type="button"
			class="ds-lib-pane-close"
			onclick={onclose}
			aria-label={words.closeSource}
		>
			<XIcon size={16} />
		</button>
		<div class="ds-lib-pane-heading">
			{#if current}
				<h2 class="ds-lib-pane-title">{current.title}</h2>
				{#if sub}<p class="ds-lib-pane-subtitle">{sub}</p>{/if}
			{:else}
				<h2 class="ds-lib-pane-title">{turn?.artefact?.title}</h2>
				{#if turn?.artefact?.summary}
					<p class="ds-lib-pane-subtitle">{turn.artefact.summary}</p>
				{/if}
			{/if}
		</div>
		{#if current}
			<select
				class="ds-lib-pane-versions"
				aria-label={words.writtenVersions}
				value={current.version}
				onchange={(event) => onversion?.(Number(event.currentTarget.value))}
			>
				{#each versions as option (option.version)}
					<option value={option.version}>{fill(words.writtenVersion, { n: option.version })}</option>
				{/each}
			</select>
			{#if source && !failed}
				<button
					type="button"
					class="ds-lib-pane-tool ds-lib-pane-copy"
					onclick={copyDocument}
					aria-label={copied ? words.copiedDocument : words.copyDocument}
				>
					{#if copied}<CheckIcon size={15} />{:else}<CopyIcon size={15} />{/if}
				</button>
			{/if}
			{#if writtenUrl && links.length > 0}
				<div class="ds-lib-pane-menu">
					<button
						type="button"
						class="ds-lib-pane-tool"
						aria-haspopup="menu"
						aria-expanded={menu}
						onclick={() => (menu = !menu)}
					>
						<DownloadIcon size={15} />{words.download}<ChevronDownIcon size={14} />
					</button>
					{#if menu}
						<ul class="ds-lib-pane-links" role="menu" aria-label={words.download}>
							{#each links as link (link.format)}
								<li role="none">
									<a
										role="menuitem"
										href={writtenUrl(current.name, current.version, link.format)}
										onclick={() => (menu = false)}>{link.label}</a
									>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
				{#if primary}
					<a
						class="ds-lib-pane-tool ds-lib-pane-quick"
						href={writtenUrl(current.name, current.version, primary.format)}
					>
						<DownloadIcon size={15} />{primary.label}
					</a>
				{/if}
			{/if}
		{/if}
	</header>

	{#if current}
		{#if changed}<p class="ds-lib-pane-changed">{changed}</p>{/if}
		{@const html = source !== null && isHtml(source.mediaType || current.media_type)}
		<div class="ds-lib-pane-body" class:is-frame={html}>
			{#if failed}
				<p class="ds-lib-pane-note">{words.documentUnavailable}</p>
			{:else if source && html}
				<iframe class="ds-lib-pane-frame" sandbox="" srcdoc={framed(source.text)} title={current.title}
				></iframe>
			{:else if source}
				<div class="ds-lib-pane-paper">
					<Markdown content={stripFrontMatter(source.text)} previous={earlier ?? undefined} />
				</div>
			{/if}
		</div>
	{:else}
		<div class="ds-lib-pane-body">
			<Markdown content={split.citations.length > 0 ? split.body : rawAnswer} />

			{#if sources.length > 0}
				<div class="ds-lib-pane-sources">
					<SourceList {sources} {words} {oncite} level={3} />
				</div>
			{/if}
		</div>
	{/if}
</aside>

<style>
	.ds-lib-pane {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		height: 100dvh;
		flex-direction: column;
		background: var(--ds-color-surface-1);
	}

	.ds-lib-pane-grabber {
		display: flex;
		justify-content: center;
		padding-top: 0.5rem;
		padding-bottom: 0.25rem;
	}

	.ds-lib-pane-grabber span {
		width: 2.25rem;
		height: 0.25rem;
		border-radius: var(--ds-radius-full);
		background: var(--ds-color-border);
	}

	/* A phone's sheet leads with Close; the column ends with it. */
	.ds-lib-pane-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-bottom: 1px solid var(--ds-color-border);
		padding: 0.5rem 1rem 0.75rem;
	}

	.ds-lib-pane-heading {
		min-width: 0;
		flex: 1;
		order: 1;
	}

	.ds-lib-pane-title,
	.ds-lib-pane-subtitle {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ds-lib-pane-title {
		color: var(--ds-color-foreground);
		font-family: inherit;
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.ds-lib-pane-subtitle {
		display: none;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-pane-close {
		display: flex;
		width: 2.5rem;
		height: 2.5rem;
		flex: none;
		align-items: center;
		justify-content: center;
		order: 0;
		border: 0;
		border-radius: var(--ds-radius-lg);
		background: none;
		color: var(--ds-color-muted-foreground);
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease;
	}

	.ds-lib-pane-close:hover {
		background: var(--ds-color-surface-2);
		color: var(--ds-color-foreground);
	}

	.ds-lib-pane-close:focus-visible,
	.ds-lib-pane-tool:focus-visible,
	.ds-lib-pane-versions:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-pane-versions {
		order: 2;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-md);
		background: var(--ds-color-surface-1);
		padding: 0.375rem 0.5rem;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: 0.8125rem;
	}

	.ds-lib-pane-tool {
		display: inline-flex;
		min-height: 2.25rem;
		align-items: center;
		gap: 0.375rem;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-md);
		background: none;
		padding: 0.25rem 0.625rem;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: 0.8125rem;
		text-decoration: none;
		cursor: pointer;
	}

	.ds-lib-pane-tool:hover {
		background: var(--ds-color-surface-2);
	}

	.ds-lib-pane-copy {
		display: none;
		order: 3;
	}

	.ds-lib-pane-menu {
		position: relative;
		display: none;
		order: 4;
	}

	.ds-lib-pane-quick {
		order: 3;
	}

	.ds-lib-pane-links {
		position: absolute;
		inset-block-start: calc(100% + 0.25rem);
		inset-inline-end: 0;
		z-index: 2;
		display: flex;
		min-width: 9rem;
		flex-direction: column;
		margin: 0;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-md);
		background: var(--ds-color-surface-1);
		padding: 0.25rem;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
		list-style: none;
	}

	.ds-lib-pane-links a {
		display: block;
		border-radius: var(--ds-radius-sm);
		padding: 0.5rem 0.625rem;
		color: var(--ds-color-foreground);
		font-size: 0.8125rem;
		text-decoration: none;
	}

	.ds-lib-pane-links a:hover,
	.ds-lib-pane-links a:focus-visible {
		background: var(--ds-color-surface-2);
	}

	.ds-lib-pane-changed {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		border-bottom: 1px solid var(--ds-color-border);
		padding: 0.5rem 1rem;
		color: var(--ds-color-muted-foreground);
		font-size: 0.8125rem;
	}

	.ds-lib-pane-changed::before {
		content: '';
		width: 2px;
		height: 0.875rem;
		flex: none;
		background: var(--ds-color-foreground);
	}

	.ds-lib-pane-body {
		min-height: 0;
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0.75rem 1rem;
	}

	.ds-lib-pane-note {
		margin: 0;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}

	/* The document is paper, light in either theme: its own ink and rules
	   replace the app's, so a dark page does not paint it grey on grey. */
	.ds-lib-pane-paper {
		--ds-color-foreground: var(--ds-paper-ink, #1b1c1e);
		--ds-color-muted-foreground: var(--ds-paper-muted, #5f6368);
		--ds-color-border: var(--ds-paper-rule, #c4c7cc);
		--ds-color-surface-1: var(--ds-paper-shade, #dcdee2);
		--ds-color-primary-ink: var(--ds-paper-ink, #1b1c1e);
		border-radius: var(--ds-radius-sm);
		background: var(--ds-paper, #e9eaec);
		padding: 1.25rem 1.5rem;
		color: var(--ds-color-foreground);
	}

	.ds-lib-pane-body.is-frame {
		overflow: hidden;
		padding: 0;
	}

	.ds-lib-pane-frame {
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
		background: #fff;
	}

	.ds-lib-pane-sources {
		margin-top: 1.5rem;
	}

	@media (min-width: 64rem) {
		.ds-lib-pane {
			position: relative;
			inset: auto;
			height: auto;
			width: 42rem;
			flex: none;
			border-inline-start: 1px solid var(--ds-color-border);
		}

		.ds-lib-pane-grabber {
			display: none;
		}

		.ds-lib-pane-header {
			padding-top: 0.75rem;
		}

		.ds-lib-pane-heading {
			order: 0;
		}

		.ds-lib-pane-subtitle {
			display: block;
		}

		.ds-lib-pane-copy,
		.ds-lib-pane-menu {
			display: inline-flex;
		}

		.ds-lib-pane-quick {
			display: none;
		}

		.ds-lib-pane-close {
			order: 5;
		}
	}
</style>
