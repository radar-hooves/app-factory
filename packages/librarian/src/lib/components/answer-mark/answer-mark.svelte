<!--
  Helpful or not, on the answer a reader has just read, with an optional note.

  Rendered by `AgentTranscript` inside its action row, between copy and ask
  again, and only when the host passes `onmark`: the Console asks its own
  library, where nothing can take a mark, and a control a host cannot wire is
  worse than none (cadmus#114, where this began).

  Several roots on purpose: the two thumbs sit in the row, and the note drops
  to a line of its own under it (`order`, `flex-basis`), so the keyboard goes
  verdict, note, ask again, which is the order a reader thinks in.

  The note is optional and opens only after a verdict, so the fast path is one
  tap. A verdict shows at once and is taken back if it was not recorded; a
  note says "noted" only once the far side confirms it.
-->
<script lang="ts">
	import ThumbsDownIcon from '@lucide/svelte/icons/thumbs-down';
	import ThumbsUpIcon from '@lucide/svelte/icons/thumbs-up';
	import type { Verdict } from '../../chat.svelte';
	import { resolveCopy, type LibrarianCopy } from '../../copy';

	interface Props {
		/** Records a verdict, replacing any before it. Resolves true once it is
		 *  recorded. */
		onmark: (verdict: Verdict) => Promise<boolean>;
		copy?: Partial<LibrarianCopy>;
	}

	let { onmark, copy }: Props = $props();

	const words = $derived(resolveCopy(copy));

	let helpful = $state<boolean | null>(null);
	let note = $state('');
	/** The note last recorded, sent again when the verdict flips: the far side
	 *  replaces the whole mark. */
	let recorded = $state<string | null>(null);
	let saving = $state(false);
	let failed = $state(false);

	async function send(verdict: Verdict): Promise<boolean> {
		saving = true;
		failed = false;
		try {
			const ok = await onmark(verdict);
			failed = !ok;
			return ok;
		} finally {
			saving = false;
		}
	}

	async function mark(next: boolean) {
		if (saving || helpful === next) return;
		const previous = helpful;
		helpful = next;
		if (!(await send({ helpful: next, note: recorded }))) helpful = previous;
	}

	async function submitNote(event: SubmitEvent) {
		event.preventDefault();
		const text = note.trim();
		if (!text || helpful === null || saving) return;
		if (await send({ helpful, note: text })) recorded = text;
	}
</script>

<button
	type="button"
	class="ds-lib-mark"
	class:is-helpful={helpful === true}
	aria-pressed={helpful === true}
	aria-label={words.markHelpful}
	title={words.markHelpful}
	disabled={saving}
	onclick={() => mark(true)}
>
	<ThumbsUpIcon size={14} />
</button>
<button
	type="button"
	class="ds-lib-mark"
	class:is-not-helpful={helpful === false}
	aria-pressed={helpful === false}
	aria-label={words.markNotHelpful}
	title={words.markNotHelpful}
	disabled={saving}
	onclick={() => mark(false)}
>
	<ThumbsDownIcon size={14} />
</button>

<!-- A note that failed keeps its box, and the words in it, to try again. -->
{#if recorded !== null && !failed}
	<p class="ds-lib-mark-line" role="status">{words.markNoted}</p>
{:else if helpful !== null}
	<form class="ds-lib-mark-line ds-lib-mark-form" onsubmit={submitNote}>
		<input
			bind:value={note}
			maxlength={500}
			placeholder={words.markNote}
			aria-label={words.markNote}
			class="ds-lib-mark-input"
		/>
		<button type="submit" class="ds-lib-mark-send" disabled={!note.trim() || saving}>
			{words.markSend}
		</button>
	</form>
{/if}
{#if failed}
	<p class="ds-lib-mark-line ds-lib-mark-failed" role="status">{words.markFailed}</p>
{/if}

<style>
	.ds-lib-mark {
		display: flex;
		width: 1.75rem;
		height: 1.75rem;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: var(--ds-radius-md);
		background: none;
		color: inherit;
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease;
	}

	.ds-lib-mark:hover:not(:disabled) {
		background: var(--ds-color-surface-1);
		color: var(--ds-color-foreground);
	}

	.ds-lib-mark:disabled {
		cursor: default;
	}

	.ds-lib-mark:focus-visible,
	.ds-lib-mark-send:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-mark.is-helpful {
		color: var(--ds-color-status-success);
	}

	.ds-lib-mark.is-not-helpful {
		color: var(--ds-color-status-error);
	}

	/* Its own line under the row, whatever sits after the thumbs in it. */
	.ds-lib-mark-line {
		order: 1;
		flex-basis: 100%;
		margin: 0.25rem 0 0 0.375rem;
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-mark-failed {
		color: var(--ds-color-status-error);
	}

	.ds-lib-mark-form {
		display: flex;
		max-width: 28rem;
		min-width: 0;
		gap: 0.5rem;
	}

	.ds-lib-mark-input {
		min-width: 0;
		flex: 1;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-md);
		background: var(--ds-color-surface-1);
		padding: 0.375rem 0.625rem;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: 0.875rem;
	}

	.ds-lib-mark-input::placeholder {
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-mark-input:focus {
		border-color: color-mix(in oklab, var(--ds-color-primary) 60%, transparent);
		outline: none;
	}

	.ds-lib-mark-send {
		flex: none;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-md);
		background: none;
		padding: 0.25rem 0.75rem;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.ds-lib-mark-send:disabled {
		cursor: default;
		opacity: 0.4;
	}
</style>
