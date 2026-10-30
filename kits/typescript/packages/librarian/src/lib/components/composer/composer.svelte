<!--
  The composer: one rounded box holding attachments, the input AND a footer row.

  Two things carry it: the quiet controls sit BELOW the input inside the same
  box rather than beside it (attach, a briefing, and where the question looks
  as one compact control), and the trailing control is a circular filled
  accent button. The empty→typing transition lives almost entirely in that
  control — the box chrome grows with the text and nothing else moves.

  While the persona is answering the box is disabled and the send button becomes a
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
	import { DEFAULT_PERSONA, resolveCopy, type ChatCopy } from '../../copy';
	import type { CollectionChoice } from './choices';
	import ScopePicker from './scope-picker.svelte';

	/** Past this many turns, the long-conversation banner offers to start
	 *  over: a follow-up re-reads the whole conversation, so each one costs
	 *  more than the last (measured — the longest ran 2.05M cached tokens). */
	const DEFAULT_TURN_LIMIT = 8;

	/** px kept between a lifted box and the keyboard. */
	const KEYBOARD_GAP = 12;

	interface Props {
		value: string;
		running: boolean;
		/** The collections this person may read. The picker renders when there
		 *  are two or more: with one, or none, there is nothing to choose. It
		 *  is one control however many there are, searchable from eight. */
		collections?: CollectionChoice[];
		/** The collection the next question is narrowed to, by name; undefined
		 *  asks across all of them. */
		collection?: string;
		/** The group the next question is narrowed to, by name: all of that
		 *  group's collections. Set only when no `collection` is. */
		group?: string;
		/** Files to send with the next question. Cleared by the caller on send. */
		files?: File[];
		/** Hides the paperclip for a host whose ask route takes no files. */
		attachments?: boolean;
		/** The person picked a collection by name, or all of them (undefined).
		 *  Called with undefined as well when they pick a group. */
		oncollection?: (collection: string | undefined) => void;
		/** The person picked a group by name. Called with undefined when they
		 *  pick a collection or all of them, so the two never disagree. */
		ongroup?: (group: string | undefined) => void;
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
		copy?: Partial<ChatCopy>;
		/** The session reads a message sent while it works — a job whose
		 *  route writes it onto the running process — so the box stays open
		 *  and Send sits beside Stop. Words only: the paperclip still waits for
		 *  the run. Absent, a chat waits for its answer. */
		sendWhileRunning?: boolean;
		/** One quiet line in the box's footer, where the collection picker would
		 *  sit, in the host's words: what sending does here ("It carries on
		 *  from where it stopped."). */
		note?: string;
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
		collections = [],
		collection,
		group,
		files = $bindable([]),
		attachments = true,
		oncollection,
		ongroup,
		onsubmit,
		onstop,
		onbriefing,
		name = DEFAULT_PERSONA,
		copy,
		note,
		sendWhileRunning = false,
		turnCount,
		turnLimit = DEFAULT_TURN_LIMIT,
		onnewquestion
	}: Props = $props();

	/** Nothing can be said right now: a chat whose answer is still coming. */
	const waiting = $derived(running && !sendWhileRunning);

	const words = $derived(resolveCopy(copy, name));

	// `[text](url)` becomes a link; only a path or an http(s) address does, so
	// copy can never smuggle in a script URL.
	const noticeParts = $derived.by(() => {
		const parts: { text: string; href?: string }[] = [];
		const line = words.composerNotice.trim();
		if (!line) return parts;
		let last = 0;
		for (const m of line.matchAll(/\[([^\]]+)\]\(((?:\/|https?:\/\/)[^)\s]*)\)/g)) {
			if (m.index > last) parts.push({ text: line.slice(last, m.index) });
			parts.push({ text: m[1], href: m[2] });
			last = m.index + m[0].length;
		}
		if (last < line.length) parts.push({ text: line.slice(last) });
		return parts;
	});

	// The banner needs somewhere to send a reader AND a reason to show at
	// all: a host that never counts turns gets today's composer, unchanged.
	const longConversation = $derived(
		turnCount !== undefined && turnCount > turnLimit && Boolean(onnewquestion)
	);

	// Who the question is put to: every collection the person may read, or one
	// of them. A person with one collection (or none) has nothing to pick, so
	// nothing renders rather than a control that only reselects itself, unless
	// the question is already narrowed to the one held: a page that has not yet
	// had the list shows the collection its address names, and the control stays
	// put as the rest of the list arrives.
	const hasChoice = $derived(
		collections.length > 1 ||
			((collection !== undefined || group !== undefined) && collections.length > 0)
	);

	let box = $state<HTMLElement | null>(null);
	let wrapper = $state<HTMLElement | null>(null);
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
		const style = getComputedStyle(el);
		const line = parseFloat(style.lineHeight) || 27;
		const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
		el.style.height = `${Math.min(el.scrollHeight, line * 6 + padding)}px`;
	}

	$effect(() => {
		// Read `value` so a programmatic change (an example question tapped in
		// the empty state) resizes the box too, not only typing.
		void value;
		grow();
	});

	// Focus comes back once the persona is done, so a reader can keep going without
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
	// the one that moves, and the box rises by however far its unlifted foot
	// falls below it: the keyboard's height for a docked box, nothing for one
	// centred above the keyboard on an empty conversation.
	//
	// The foot is read from layout, never from where the box is drawn: the
	// transform's current value (mid-transition included) and the safe-area
	// padding that lifting removes are both taken back out, so a second event
	// inside the 150ms transition cannot read a half-lifted box and overshoot.
	// Any scroll re-measures, since a scrolling stage moves the box too.
	let lift = $state(0);
	$effect(() => {
		const viewport = globalThis.visualViewport;
		if (!viewport) return;
		const measure = () => {
			const shown = viewport.offsetTop + viewport.height;
			if (!wrapper || shown >= window.innerHeight) {
				lift = 0;
				return;
			}
			const style = getComputedStyle(wrapper);
			const drawn = style.transform === 'none' ? 0 : new DOMMatrixReadOnly(style.transform).m42;
			const foot =
				wrapper.getBoundingClientRect().bottom - drawn - (parseFloat(style.paddingBottom) || 0);
			lift = Math.max(0, Math.round(foot + KEYBOARD_GAP - shown));
		};
		measure();
		viewport.addEventListener('resize', measure);
		viewport.addEventListener('scroll', measure);
		document.addEventListener('scroll', measure, { capture: true, passive: true });
		return () => {
			viewport.removeEventListener('resize', measure);
			viewport.removeEventListener('scroll', measure);
			document.removeEventListener('scroll', measure, { capture: true });
		};
	});
</script>

<div
	bind:this={wrapper}
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

	<div class="ds-lib-box" bind:this={box}>
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
			rows="3"
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
					<PaperclipIcon size={20} />
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
					<FileTextIcon size={20} />
				</button>
			{/if}

			{#if hasChoice}
				<ScopePicker
					{collections}
					{collection}
					{group}
					{words}
					anchor={box}
					onchoose={(pick) => {
						oncollection?.(pick.collection);
						ongroup?.(pick.group);
						textarea?.focus();
					}}
				/>
			{:else if note}
				<span class="ds-lib-note">{note}</span>
			{/if}
			<span class="ds-lib-spacer"></span>
			{#if running}
				<button type="button" class="ds-lib-stop" onclick={onstop} aria-label="Stop">
					<SquareIcon size={16} fill="currentColor" />
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
					<ArrowUpIcon size={20} />
				</button>
			{/if}
		</div>
	</div>

	{#if rejected}
		<p class="ds-lib-rejected" role="status" aria-live="polite">{rejected}</p>
	{/if}

	{#if noticeParts.length > 0}
		<p class="ds-lib-notice" data-testid="ds-lib-composer-notice">
			{#each noticeParts as part, i (i)}
				{#if part.href}<a href={part.href}>{part.text}</a>{:else}{part.text}{/if}
			{/each}
		</p>
	{/if}
</div>

<style>
	.ds-lib-composer-lift {
		transition: transform 150ms ease;
	}

	/* Positioned: the scope list is placed against it. */
	.ds-lib-box {
		position: relative;
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
		padding: var(--ds-spacing-md) var(--ds-spacing-md) var(--ds-spacing-sm);
		color: var(--ds-color-foreground);
		font: inherit;
		/* No token carries a body size or a control size, so these are raw:
		   a resting box that reads as a chat composer on every page (an app
		   overriding them is a defect here). Three lines, 18px text. */
		font-size: 1.125rem;
		line-height: 1.5;
		outline: none;
	}

	.ds-lib-input::placeholder {
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-input:disabled {
		opacity: 0.6;
	}

	/* One row at every width: the scope chip gives way (its words wrap onto a second
	   line, never cut) before Send leaves the right-hand end of the box (operator, 24/10/2026:
	   on a phone it wrapped to the bottom-left). */
	.ds-lib-controls {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		gap: 0.5rem;
		padding: 0 var(--ds-spacing-sm) var(--ds-spacing-sm);
	}

	.ds-lib-picker {
		display: none;
	}

	.ds-lib-icon-button,
	.ds-lib-stop,
	.ds-lib-send {
		display: flex;
		width: 2.75rem;
		height: 2.75rem;
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

	.ds-lib-notice {
		margin: 0.5rem 0 0;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
		line-height: 1.4;
		text-align: center;
	}

	.ds-lib-notice a {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.ds-lib-notice a:hover {
		color: var(--ds-color-foreground);
	}

	@media (prefers-reduced-motion: reduce) {
		.ds-lib-composer-lift {
			transition: none;
		}
	}
</style>
