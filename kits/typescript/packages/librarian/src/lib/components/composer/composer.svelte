<!--
  The composer: one rounded box holding attachments, the input AND a footer row.

  Two things carry it: the chips sit BELOW the input inside the same box rather
  than beside it, and the trailing control is a circular filled accent button.
  The empty→typing transition lives almost entirely in that control — the box
  chrome grows with the text and nothing else moves.

  While Milton is answering the box is disabled and the send button becomes a
  stop button: an ask route takes one question per request, and a box that
  takes typing it will then discard is worse than one that plainly waits. A
  host whose session reads messages while it works (`sendWhileRunning`) keeps
  the box open, with Send beside Stop.
-->
<script lang="ts">
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import SquareIcon from '@lucide/svelte/icons/square';
	import XIcon from '@lucide/svelte/icons/x';
	import {
		ACCEPT_ATTRIBUTE,
		acceptFiles,
		formatSize,
		MAX_FILES,
		rejectionMessage
	} from '../../attachments';
	import type { Depth } from '../../client';
	import { DEFAULT_PERSONA, resolveCopy, type LibrarianCopy } from '../../copy';

	/** Past this many turns, the long-conversation banner offers to start
	 *  over: a follow-up re-reads the whole conversation, so each one costs
	 *  more than the last (measured — the longest ran 2.05M cached tokens). */
	const DEFAULT_TURN_LIMIT = 8;

	export type Scope = 'document' | 'collection' | 'library';

	interface Props {
		value: string;
		running: boolean;
		/** What the next message is about. A surface with one scope — a
		 *  session over one document — passes none and offers no choice. */
		scope?: Scope;
		/** Files to send with the next question. Cleared by the caller on send. */
		files?: File[];
		/** Names for the two narrower scopes; absent means that scope is unavailable. */
		documentName?: string;
		collectionName?: string;
		/** Hides the paperclip for a host whose ask route takes no files. */
		attachments?: boolean;
		onscope?: (scope: Scope) => void;
		onsubmit: () => void;
		onstop: () => void;
		/** Asks for a study artefact instead of an ordinary answer. Omit and no
		 *  control renders — studying is a mode of asking, never a tab, so a
		 *  host with nothing to build offers none rather than a disabled one. */
		onbriefing?: () => void;
		/** Who is being asked. A slug is fine — `penny` renders as "Penny" — and
		 *  both placeholders are composed from it. */
		name?: string;
		/** Overrides for the package's own words. */
		copy?: Partial<LibrarianCopy>;
		/** The session reads a message sent while it works — a job whose
		 *  route writes it onto the running process — so the box stays open
		 *  and Send sits beside Stop. Words only: the paperclip still waits for
		 *  the run. Absent, a chat waits for its answer. */
		sendWhileRunning?: boolean;
		/** One quiet line in the box's footer, where a scope choice would
		 *  sit, in the host's words: what sending does here ("It carries on
		 *  from where it stopped."). */
		note?: string;
		/** Quick or Thorough for the NEXT question — a two-way switch beside a
		 *  one-line hint saying what the picked side is for. Bind it (the
		 *  host's own state, `'quick'` to start) and hand the value to `ask()`
		 *  on submit; omit the prop entirely and nothing renders, exactly as
		 *  today's composer.
		 *
		 *  Once a host DOES offer the choice, the operator's ruling is
		 *  absolute (30/09/2026): it is never disabled, hidden or greyed out,
		 *  and never explained by naming a model — Thorough always means
		 *  something, a bigger reading budget on the strongest model the room
		 *  allows, even where that model is a local one. */
		depth?: Depth;
		/** How many turns are in the conversation so far. Past `turnLimit`
		 *  (8 by default), a quiet banner appears above the box offering to
		 *  start over. Omit and no banner ever renders — a host that does not
		 *  track turns keeps today's composer. */
		turnCount?: number;
		turnLimit?: number;
		/** Starts a new conversation, from the banner's own button. Without it
		 *  the banner never renders, past the limit or not — an offer with no
		 *  action is worse than none. */
		onnewquestion?: () => void;
	}

	let {
		value = $bindable(),
		running,
		scope,
		files = $bindable([]),
		documentName,
		collectionName,
		attachments = true,
		onscope,
		onsubmit,
		onstop,
		onbriefing,
		name = DEFAULT_PERSONA,
		copy,
		note,
		sendWhileRunning = false,
		depth = $bindable(),
		turnCount,
		turnLimit = DEFAULT_TURN_LIMIT,
		onnewquestion
	}: Props = $props();

	/** Nothing can be said right now: a chat whose answer is still coming. */
	const waiting = $derived(running && !sendWhileRunning);

	const words = $derived(resolveCopy(copy, name));

	// The banner needs somewhere to send a reader AND a reason to show at
	// all: a host that never counts turns gets today's composer, unchanged.
	const longConversation = $derived(
		turnCount !== undefined && turnCount > turnLimit && Boolean(onnewquestion)
	);

	// What Milton is being asked about — this document, this collection, or
	// the whole library. Callers that have no narrower scope pass neither
	// name, leaving "The whole library" the sole entry — and a sole entry is
	// not a choice, so `hasChoice` below hides it rather than rendering a
	// chip with nothing to switch to.
	const choices = $derived(
		[
			documentName ? { id: 'document' as const, label: documentName } : null,
			collectionName ? { id: 'collection' as const, label: collectionName } : null,
			{ id: 'library' as const, label: 'The whole library' }
		].filter((c) => c !== null)
	);

	// A room with one shelf set has one scope, fixed by the caller never
	// passing a name — no pick to make, so the row renders nothing rather
	// than a chip that only ever reselects itself (design-system, the
	// fixed-scope Composer defect).
	const hasChoice = $derived(scope !== undefined && choices.length > 1);

	// Three chips in a narrow column clipped all three to fragments
	// ("defence-s…", "All colle…"). Wrapping beats truncating: a chip a reader
	// cannot finish reading is not a control, it is decoration.

	let textarea = $state<HTMLTextAreaElement | null>(null);
	let picker = $state<HTMLInputElement | null>(null);
	let rejected = $state('');

	/** Six lines, then it scrolls. A `rows` attribute cannot express that —
	 *  it sets the floor, not the ceiling — so the height is measured from the
	 *  content and capped. `height: auto` first, or `scrollHeight` reports the
	 *  height the box already has and the box can only ever grow. */
	function grow() {
		const el = textarea;
		if (!el) return;
		el.style.height = 'auto';
		const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
		el.style.height = `${Math.min(el.scrollHeight, line * 6 + 20)}px`;
	}

	$effect(() => {
		// Read `value` so a programmatic change (an example question tapped in
		// the empty state) resizes the box too, not only typing.
		void value;
		grow();
	});

	// Focus comes back once Milton is done, so a reader can keep going without
	// reaching for the mouse. It has to be the transition OUT of `waiting`: a
	// disabled element cannot hold focus, so the focus call in `submit()` below
	// survives only for a box that never disables — measured, focus lands on
	// `body` the frame the box disables and comes back here. A box that stayed
	// open never lost focus, so it takes none back from wherever the reader
	// went while the run worked.
	//
	// Plain, not `$state`: read and written in the same effect, which would
	// otherwise re-trigger itself forever.
	let wasWaiting = false;
	$effect(() => {
		if (wasWaiting && !waiting) textarea?.focus();
		wasWaiting = waiting;
	});

	function submit() {
		if (!value.trim() || waiting) return;
		onsubmit();
		textarea?.focus();
	}

	function keydown(event: KeyboardEvent) {
		// Enter sends, Shift+Enter breaks the line — the convention in every
		// reference and the one a user will try first.
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			submit();
		}
	}

	function take(list: FileList | File[] | null) {
		if (!list) return;
		const check = acceptFiles(files, list);
		files = check.accepted;
		rejected = rejectionMessage(check.rejected);
	}

	function pick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		take(input.files);
		// Same file twice in a row fires no change event unless the value is
		// cleared, so removing a chip and re-adding it would silently do nothing.
		input.value = '';
	}

	function remove(index: number) {
		files = files.filter((_, i) => i !== index);
		rejected = '';
	}

	// The keyboard does not shrink the layout viewport on iOS, so a composer at
	// the bottom of a full-height column sits UNDER it. The visual viewport is
	// the one that moves; the overlap between the two is exactly how far the
	// box must rise.
	let lift = $state(0);
	$effect(() => {
		const viewport = globalThis.visualViewport;
		if (!viewport) return;
		const measure = () => {
			lift = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
		};
		measure();
		viewport.addEventListener('resize', measure);
		viewport.addEventListener('scroll', measure);
		return () => {
			viewport.removeEventListener('resize', measure);
			viewport.removeEventListener('scroll', measure);
		};
	});
</script>

<div
	class="ds-lib-composer-lift"
	style="transform: translateY(-{lift}px); padding-bottom: {lift
		? '0px'
		: 'env(safe-area-inset-bottom, 0px)'}"
>
	{#if longConversation}
		<div class="ds-lib-long" role="status">
			<ClockIcon size={16} />
			<span>{words.longConversation}</span>
			<button type="button" class="ds-lib-long-new" onclick={onnewquestion}>
				{words.newQuestion}
			</button>
		</div>
	{/if}

	<div class="ds-lib-box">
		{#if files.length > 0}
			<ul class="ds-lib-files">
				{#each files as file, index (file.name + file.size)}
					<li class="ds-lib-file">
						<span class="ds-lib-file-name">{file.name}</span>
						<span class="ds-lib-file-size">{formatSize(file.size)}</span>
						<button
							type="button"
							class="ds-lib-file-remove"
							onclick={() => remove(index)}
							aria-label="Remove {file.name}"
						>
							<XIcon size={12} />
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		<textarea
			bind:this={textarea}
			bind:value
			oninput={grow}
			onkeydown={keydown}
			rows="1"
			disabled={waiting}
			placeholder={waiting ? words.answeringPlaceholder : words.askPlaceholder}
			class="ds-lib-input"
		></textarea>

		<div class="ds-lib-controls">
			{#if attachments}
				<input
					bind:this={picker}
					type="file"
					multiple
					accept={ACCEPT_ATTRIBUTE}
					onchange={pick}
					class="ds-lib-picker"
					tabindex="-1"
					aria-hidden="true"
				/>
				<button
					type="button"
					class="ds-lib-icon-button"
					onclick={() => picker?.click()}
					disabled={running || files.length >= MAX_FILES}
					aria-label="Attach a file"
				>
					<PaperclipIcon size={16} />
				</button>
			{/if}

			{#if onbriefing}
				<button
					type="button"
					class="ds-lib-icon-button"
					onclick={onbriefing}
					disabled={running}
					aria-label="Ask for a briefing"
					title="Ask for a briefing"
				>
					<FileTextIcon size={16} />
				</button>
			{/if}

			{#if depth !== undefined}
				<div role="group" aria-label={words.depthGroupLabel} class="ds-lib-depth">
					<button
						type="button"
						aria-pressed={depth === 'quick'}
						class="ds-lib-depth-side"
						class:is-chosen={depth === 'quick'}
						onclick={() => (depth = 'quick')}
					>
						{words.depthQuick}
					</button>
					<button
						type="button"
						aria-pressed={depth === 'thorough'}
						class="ds-lib-depth-side"
						class:is-chosen={depth === 'thorough'}
						onclick={() => (depth = 'thorough')}
					>
						{words.depthThorough}
					</button>
				</div>
				<span class="ds-lib-note">
					{depth === 'quick' ? words.depthQuickHint : words.depthThoroughHint}
				</span>
			{/if}
			{#if hasChoice}
				<div class="ds-lib-scopes">
					{#each choices as choice (choice.id)}
						<button
							type="button"
							class="ds-lib-scope-chip"
							class:is-chosen={scope === choice.id}
							onclick={() => onscope?.(choice.id)}
						>
							{choice.label}
						</button>
					{/each}
				</div>
			{:else if note}
				<span class="ds-lib-note">{note}</span>
			{/if}
			<span class="ds-lib-spacer"></span>
			{#if running}
				<button type="button" class="ds-lib-stop" onclick={onstop} aria-label="Stop">
					<SquareIcon size={14} fill="currentColor" />
				</button>
			{/if}
			{#if !waiting}
				<button
					type="button"
					class="ds-lib-send"
					onclick={submit}
					disabled={!value.trim()}
					aria-label="Send"
				>
					<ArrowUpIcon size={16} />
				</button>
			{/if}
		</div>
	</div>

	{#if rejected}
		<p class="ds-lib-rejected" role="status" aria-live="polite">{rejected}</p>
	{/if}
</div>

<style>
	.ds-lib-composer-lift {
		transition: transform 150ms ease;
	}

	.ds-lib-box {
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-xl);
		background: var(--ds-color-surface-1);
		transition: border-color 150ms ease;
	}

	.ds-lib-box:focus-within {
		border-color: color-mix(in oklab, var(--ds-color-primary) 60%, transparent);
	}

	.ds-lib-files {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin: 0;
		padding: 0.75rem 0.75rem 0;
		list-style: none;
	}

	.ds-lib-file {
		display: flex;
		max-width: 100%;
		align-items: center;
		gap: 0.375rem;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-lg);
		background: var(--ds-color-surface-2);
		padding: 0.25rem 0.25rem 0.25rem 0.5rem;
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ds-color-foreground);
	}

	.ds-lib-file-size {
		flex: none;
		color: var(--ds-color-muted-foreground);
		font-variant-numeric: tabular-nums;
	}

	.ds-lib-file-remove {
		display: flex;
		width: 1.25rem;
		height: 1.25rem;
		flex: none;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: var(--ds-radius-sm);
		background: none;
		color: var(--ds-color-muted-foreground);
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease;
	}

	.ds-lib-file-remove:hover {
		background: var(--ds-color-surface-3);
		color: var(--ds-color-foreground);
	}

	.ds-lib-input {
		display: block;
		width: 100%;
		resize: none;
		border: 0;
		background: transparent;
		padding: 0.75rem 1rem 0.5rem;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: 1rem;
		outline: none;
	}

	.ds-lib-input::placeholder {
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-input:disabled {
		opacity: 0.6;
	}

	.ds-lib-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		row-gap: 0.375rem;
		padding: 0 0.75rem 0.625rem;
	}

	.ds-lib-picker {
		display: none;
	}

	.ds-lib-icon-button,
	.ds-lib-stop,
	.ds-lib-send {
		display: flex;
		width: 2rem;
		height: 2rem;
		flex: none;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: var(--ds-radius-full);
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease,
			opacity 150ms ease;
	}

	.ds-lib-icon-button {
		background: none;
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-icon-button:hover:not(:disabled) {
		background: var(--ds-color-surface-2);
		color: var(--ds-color-foreground);
	}

	.ds-lib-icon-button:disabled,
	.ds-lib-send:disabled {
		cursor: default;
		opacity: 0.3;
	}

	.ds-lib-icon-button:focus-visible,
	.ds-lib-stop:focus-visible,
	.ds-lib-send:focus-visible,
	.ds-lib-scope-chip:focus-visible,
	.ds-lib-file-remove:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-stop {
		background: var(--ds-color-foreground);
		color: var(--ds-color-background);
	}

	.ds-lib-send {
		background: var(--ds-color-primary);
		color: var(--ds-color-primary-foreground);
	}

	.ds-lib-send:hover:not(:disabled),
	.ds-lib-stop:hover {
		opacity: 0.9;
	}

	/* Three chips in a narrow column clipped all three to fragments
	   ("defence-s…", "All colle…"). Wrapping beats truncating: a chip a reader
	   cannot finish reading is not a control, it is decoration. */
	.ds-lib-scopes {
		display: flex;
		min-width: 0;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem;
	}

	.ds-lib-scope-chip {
		max-width: 100%;
		overflow: hidden;
		border: 1px solid transparent;
		border-radius: var(--ds-radius-full);
		background: none;
		padding: 0.125rem 0.5rem;
		color: var(--ds-color-muted-foreground);
		font: inherit;
		font-size: var(--ds-text-2xs);
		text-overflow: ellipsis;
		white-space: nowrap;
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease;
	}

	.ds-lib-scope-chip:hover {
		color: var(--ds-color-foreground);
	}

	.ds-lib-scope-chip.is-chosen {
		border-color: color-mix(in oklab, var(--ds-color-primary) 40%, transparent);
		background: color-mix(in oklab, var(--ds-color-primary) 15%, transparent);
		color: var(--ds-color-foreground);
	}

	.ds-lib-spacer {
		flex: 1;
	}

	.ds-lib-note {
		min-width: 0;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-rejected {
		margin: 0;
		padding: 0.375rem 0.25rem 0;
		color: var(--ds-color-status-error);
		font-size: var(--ds-text-2xs);
	}

	/* A labelled button group, never a select: two states a reader compares
	   at a glance, not a list to open. 44px touch targets throughout — the
	   one row here a colleague reaches for on every single question. */
	.ds-lib-depth {
		display: flex;
		flex: none;
		gap: 0.125rem;
		border-radius: var(--ds-radius-lg);
		background: var(--ds-color-surface-3);
		padding: 0.1875rem;
	}

	.ds-lib-depth-side {
		min-width: 2.75rem;
		min-height: 2.75rem;
		border: 0;
		border-radius: var(--ds-radius-md);
		background: none;
		padding: 0 0.75rem;
		color: var(--ds-color-muted-foreground);
		font: inherit;
		font-size: var(--ds-text-2xs);
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease;
	}

	.ds-lib-depth-side:hover {
		color: var(--ds-color-foreground);
	}

	.ds-lib-depth-side.is-chosen {
		background: var(--ds-color-primary);
		color: var(--ds-color-primary-foreground);
		font-weight: 600;
	}

	.ds-lib-depth-side:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	/* Above the box, never inside it: it is about the conversation so far,
	   not this one question. Warning-tinted, never error — nothing has gone
	   wrong, a follow-up just costs more than the last one did. */
	.ds-lib-long {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		border: 1px solid color-mix(in oklab, var(--ds-color-status-warning) 40%, transparent);
		border-radius: var(--ds-radius-lg);
		background: color-mix(in oklab, var(--ds-color-status-warning) 12%, transparent);
		padding: 0.5rem 0.5rem 0.5rem 0.875rem;
		color: var(--ds-color-foreground);
		font-size: 0.875rem;
	}

	.ds-lib-long span {
		flex: 1;
	}

	.ds-lib-long-new {
		min-height: 2.75rem;
		flex: none;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-md);
		background: transparent;
		padding: 0 0.875rem;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: var(--ds-text-2xs);
		cursor: pointer;
		transition: background-color 150ms ease;
	}

	.ds-lib-long-new:hover {
		background: var(--ds-color-surface-2);
	}

	.ds-lib-long-new:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.ds-lib-composer-lift {
			transition: none;
		}
	}
</style>
