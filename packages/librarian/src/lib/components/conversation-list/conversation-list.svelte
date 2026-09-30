<!--
  A person's past conversations, newest first: each one reopens, and each can
  be renamed, downloaded or deleted. And a way to start a new one.

  From cadmus's Past questions (cadmus#114). Presentation only: the host hands
  it the list and the acts (`Chat`'s own), nothing here fetches, and where it
  sits — a column, a sheet — is the host's.

  Each row's acts open under it rather than in a floating menu, and a delete
  asks under the row too: nothing to position, nothing to trap focus in, and
  a thumb on a phone reaches all of it.
-->
<script lang="ts">
	import DownloadIcon from '@lucide/svelte/icons/download';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import MoreHorizontalIcon from '@lucide/svelte/icons/more-horizontal';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import type { ConversationSummary } from '../../chat.svelte';
	import { DEFAULT_PERSONA, resolveCopy, type LibrarianCopy } from '../../copy';

	interface Props {
		/** Null while it is still being read. */
		conversations: ConversationSummary[] | null;
		/** It could not be read. */
		failed?: boolean;
		/** The conversation open now. */
		current?: string | null;
		/** Each row's address, which makes it a link: a conversation the page
		 *  keeps in its address opens by following it. */
		href?: (id: string) => string;
		/** A row chosen; with `href`, as well as following it. */
		onopen?: (id: string) => void;
		onnew: () => void;
		/** Each act offered only when given; each resolves true once done. */
		onrename?: (id: string, title: string) => Promise<boolean>;
		ondownload?: (id: string) => Promise<boolean>;
		ondelete?: (id: string) => Promise<boolean>;
		/** Who is answering, for the line on a conversation still being answered. */
		name?: string;
		copy?: Partial<LibrarianCopy>;
	}

	let {
		conversations,
		failed = false,
		current = null,
		href,
		onopen,
		onnew,
		onrename,
		ondownload,
		ondelete,
		name = DEFAULT_PERSONA,
		copy
	}: Props = $props();

	const words = $derived(resolveCopy(copy, name));
	const acts = $derived(Boolean(onrename || ondownload || ondelete));

	const newestFirst = $derived(
		[...(conversations ?? [])].sort(
			(a, b) => (Date.parse(b.last_activity_at) || 0) - (Date.parse(a.last_activity_at) || 0)
		)
	);

	let opened = $state<string | null>(null);
	let renaming = $state<string | null>(null);
	let deleting = $state<string | null>(null);
	let title = $state('');
	let problem = $state('');
	let busy = $state(false);
	let field = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (renaming && field) field.select();
	});

	function toggle(id: string) {
		opened = opened === id ? null : id;
		deleting = null;
		problem = '';
	}

	function close() {
		opened = null;
		renaming = null;
		deleting = null;
	}

	async function run(act: () => Promise<boolean>, failure: string) {
		if (busy) return;
		busy = true;
		problem = '';
		try {
			if (await act()) close();
			else problem = failure;
		} finally {
			busy = false;
		}
	}

	function startRename(conversation: ConversationSummary) {
		renaming = conversation.id;
		title = conversation.title;
		problem = '';
	}

	function submitRename(event: SubmitEvent, id: string) {
		event.preventDefault();
		const next = title.trim();
		if (!next || !onrename) return;
		void run(() => onrename(id, next), words.renameFailed);
	}
</script>

<section class="ds-lib-list" aria-label={words.pastQuestions}>
	<header class="ds-lib-list-head">
		<h2 class="ds-lib-list-title">{words.pastQuestions}</h2>
		<button type="button" class="ds-lib-list-new" onclick={onnew}>
			<PlusIcon size={14} />
			<span>{words.newQuestion}</span>
		</button>
	</header>

	{#if failed}
		<p class="ds-lib-list-note">{words.pastQuestionsFailed}</p>
	{:else if conversations === null}
		<p class="ds-lib-list-note">{words.readingPastQuestions}</p>
	{:else if newestFirst.length === 0}
		<p class="ds-lib-list-note">{words.noPastQuestions}</p>
	{:else}
		<ul class="ds-lib-list-items">
			{#each newestFirst as conversation (conversation.id)}
				{@const id = conversation.id}
				<li class="ds-lib-list-item" class:is-current={id === current}>
					{#if renaming === id}
						<form class="ds-lib-list-rename" onsubmit={(event) => submitRename(event, id)}>
							<input
								bind:this={field}
								bind:value={title}
								maxlength={120}
								aria-label={words.rename}
								class="ds-lib-list-input"
								onkeydown={(event) => {
									if (event.key === 'Escape') renaming = null;
								}}
							/>
							<button type="submit" class="ds-lib-list-act" disabled={!title.trim() || busy}>
								{words.save}
							</button>
							<button type="button" class="ds-lib-list-act" onclick={() => (renaming = null)}>
								{words.cancel}
							</button>
						</form>
					{:else}
						<div class="ds-lib-list-row">
							{#snippet label()}
								<MessageSquareIcon size={14} class="ds-lib-list-icon" />
								<span class="ds-lib-list-name">{conversation.title}</span>
								{#if conversation.answering_since}
									<span class="ds-lib-list-live" title={words.stillAnswering}>
										<span class="ds-lib-sr">{words.stillAnswering}</span>
									</span>
								{/if}
							{/snippet}
							{#if href}
								<a
									class="ds-lib-list-open"
									href={href(id)}
									aria-current={id === current ? 'page' : undefined}
									onclick={() => onopen?.(id)}
								>
									{@render label()}
								</a>
							{:else}
								<button
									type="button"
									class="ds-lib-list-open"
									aria-current={id === current ? 'true' : undefined}
									onclick={() => onopen?.(id)}
								>
									{@render label()}
								</button>
							{/if}
							{#if acts}
								<button
									type="button"
									class="ds-lib-list-more"
									aria-expanded={opened === id}
									aria-label="{words.conversationActions}: {conversation.title}"
									onclick={() => toggle(id)}
								>
									<MoreHorizontalIcon size={16} />
								</button>
							{/if}
						</div>
						{#if opened === id && deleting === id}
							<div class="ds-lib-list-confirm" role="group" aria-label={words.delete}>
								<p>{words.deletePrompt}</p>
								<div class="ds-lib-list-acts">
									<button
										type="button"
										class="ds-lib-list-act is-destructive"
										disabled={busy}
										onclick={() => ondelete && run(() => ondelete(id), words.deleteFailed)}
									>
										{words.delete}
									</button>
									<button type="button" class="ds-lib-list-act" onclick={() => (deleting = null)}>
										{words.cancel}
									</button>
								</div>
							</div>
						{:else if opened === id}
							<div class="ds-lib-list-acts">
								{#if onrename}
									<button
										type="button"
										class="ds-lib-list-act"
										onclick={() => startRename(conversation)}
									>
										<PencilIcon size={14} />
										{words.rename}
									</button>
								{/if}
								{#if ondownload}
									<button
										type="button"
										class="ds-lib-list-act"
										disabled={busy}
										onclick={() => run(() => ondownload(id), words.downloadFailed)}
									>
										<DownloadIcon size={14} />
										{words.download}
									</button>
								{/if}
								{#if ondelete}
									<button type="button" class="ds-lib-list-act" onclick={() => (deleting = id)}>
										<TrashIcon size={14} />
										{words.delete}
									</button>
								{/if}
							</div>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if problem}
		<p class="ds-lib-list-problem" role="status">{problem}</p>
	{/if}
</section>

<style>
	.ds-lib-list {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.5rem;
	}

	.ds-lib-list-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.25rem 0.5rem 0.5rem;
	}

	.ds-lib-list-title {
		flex: 1;
		margin: 0;
		color: var(--ds-color-foreground);
		font-family: inherit;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.ds-lib-list-new,
	.ds-lib-list-act {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-md);
		background: none;
		padding: 0.375rem 0.625rem;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: 0.8125rem;
		cursor: pointer;
		transition: background-color 150ms ease;
	}

	.ds-lib-list-new:hover,
	.ds-lib-list-act:hover:not(:disabled) {
		background: var(--ds-color-surface-2);
	}

	.ds-lib-list-act:disabled {
		cursor: default;
		opacity: 0.5;
	}

	/* The house destructive button: a tint, and the colour in the words. */
	.ds-lib-list-act.is-destructive {
		border-color: transparent;
		background: color-mix(in oklab, var(--ds-color-destructive) 12%, transparent);
		color: var(--ds-color-destructive);
	}

	.ds-lib-list-act.is-destructive:hover:not(:disabled) {
		background: color-mix(in oklab, var(--ds-color-destructive) 20%, transparent);
	}

	.ds-lib-list-note,
	.ds-lib-list-problem {
		margin: 0;
		padding: 0.25rem 0.5rem;
		color: var(--ds-color-muted-foreground);
		font-size: 0.875rem;
	}

	.ds-lib-list-problem {
		color: var(--ds-color-status-error);
	}

	.ds-lib-list-items {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.ds-lib-list-item {
		border-radius: var(--ds-radius-md);
	}

	.ds-lib-list-item.is-current {
		background: var(--ds-color-surface-3);
	}

	.ds-lib-list-row {
		display: flex;
		align-items: center;
	}

	/* 44px: a row is a thumb's target on a phone. */
	.ds-lib-list-open {
		display: flex;
		min-width: 0;
		min-height: 2.75rem;
		flex: 1;
		align-items: center;
		gap: 0.5rem;
		border: 0;
		border-radius: var(--ds-radius-md);
		background: none;
		padding: 0.25rem 0.5rem;
		color: var(--ds-color-muted-foreground);
		font: inherit;
		font-size: 0.875rem;
		text-align: start;
		text-decoration: none;
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease;
	}

	.ds-lib-list-open:hover {
		background: var(--ds-color-surface-2);
		color: var(--ds-color-foreground);
	}

	.is-current .ds-lib-list-open {
		color: var(--ds-color-foreground);
	}

	.ds-lib-list-open :global(.ds-lib-list-icon) {
		flex: none;
		opacity: 0.6;
	}

	.ds-lib-list-name {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ds-lib-list-live {
		width: 0.375rem;
		height: 0.375rem;
		flex: none;
		border-radius: var(--ds-radius-full);
		background: var(--ds-color-status-info);
		animation: ds-lib-list-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	.ds-lib-list-more {
		display: grid;
		width: 2.75rem;
		height: 2.75rem;
		flex: none;
		place-items: center;
		border: 0;
		border-radius: var(--ds-radius-md);
		background: none;
		color: var(--ds-color-muted-foreground);
		cursor: pointer;
	}

	.ds-lib-list-more:hover,
	.ds-lib-list-more[aria-expanded='true'] {
		color: var(--ds-color-foreground);
	}

	.ds-lib-list-acts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem 0.5rem;
	}

	.ds-lib-list-confirm {
		padding: 0.25rem 0 0;
	}

	.ds-lib-list-confirm p {
		margin: 0;
		padding: 0 0.5rem;
		color: var(--ds-color-foreground);
		font-size: 0.8125rem;
	}

	.ds-lib-list-rename {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem;
	}

	.ds-lib-list-input {
		min-width: 0;
		flex: 1;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-md);
		background: var(--ds-color-surface-1);
		padding: 0.375rem 0.5rem;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: 0.875rem;
	}

	.ds-lib-list-input:focus {
		border-color: color-mix(in oklab, var(--ds-color-primary) 60%, transparent);
		outline: none;
	}

	.ds-lib-list-new:focus-visible,
	.ds-lib-list-act:focus-visible,
	.ds-lib-list-open:focus-visible,
	.ds-lib-list-more:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: -2px;
	}

	.ds-lib-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@keyframes ds-lib-list-pulse {
		50% {
			opacity: 0.4;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ds-lib-list-live {
			animation: none;
		}
	}
</style>
