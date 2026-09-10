<!--
  The composer: one rounded box holding attachments, the input AND a footer row.

  Two things carry it: the chips sit BELOW the input inside the same box rather
  than beside it, and the trailing control is a circular filled accent button.
  The empty→typing transition lives almost entirely in that control — the box
  chrome grows with the text and nothing else moves.

  While Milton is answering the box is disabled and the send button becomes a
  stop button. Queuing the next message is not built, and a box that takes
  typing it will then discard is worse than one that plainly waits.
-->
<script lang="ts">
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
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

	export type Scope = 'document' | 'collection' | 'library';

	interface Props {
		value: string;
		running: boolean;
		scope: Scope;
		/** Files to send with the next question. Cleared by the caller on send. */
		files?: File[];
		/** Names for the two narrower scopes; absent means that scope is unavailable. */
		documentName?: string;
		collectionName?: string;
		/** Hides the paperclip for a host whose ask route takes no files. */
		attachments?: boolean;
		onscope: (scope: Scope) => void;
		onsubmit: () => void;
		onstop: () => void;
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
		onstop
	}: Props = $props();

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
	const hasChoice = $derived(choices.length > 1);

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
	// reaching for the mouse. It has to be the transition OUT of `running`: a
	// disabled element cannot hold focus, so the focus call in `submit()` below
	// survives only for a host that never sets `running` — measured, focus lands
	// on `body` the frame the box disables and comes back here.
	//
	// Plain, not `$state`: read and written in the same effect, which would
	// otherwise re-trigger itself forever.
	let wasRunning = false;
	$effect(() => {
		if (wasRunning && !running) textarea?.focus();
		wasRunning = running;
	});

	function submit() {
		if (!value.trim() || running) return;
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
	style="transform: translateY(-{lift}px); padding-bottom: {lift
		? '0px'
		: 'env(safe-area-inset-bottom, 0px)'}"
	class="transition-transform duration-150"
>
	<div
		class="border-border bg-surface-1 focus-within:border-primary/60 rounded-xl border transition-colors"
	>
		{#if files.length > 0}
			<ul class="flex flex-wrap gap-1.5 px-3 pt-3">
				{#each files as file, index (file.name + file.size)}
					<li
						class="border-border bg-surface-2 flex max-w-full items-center gap-1.5 rounded-lg border py-1 pr-1 pl-2 text-xs"
					>
						<span class="text-foreground truncate">{file.name}</span>
						<span class="text-muted-foreground shrink-0 tabular-nums">{formatSize(file.size)}</span
						>
						<button
							type="button"
							onclick={() => remove(index)}
							aria-label="Remove {file.name}"
							class="text-muted-foreground hover:text-foreground hover:bg-surface-3 focus-visible:ring-ring flex size-5 shrink-0 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
						>
							<XIcon class="size-3" />
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
			disabled={running}
			placeholder={running ? 'Milton is answering…' : 'Ask Milton…'}
			class="text-foreground placeholder:text-muted-foreground w-full resize-none bg-transparent px-4 pt-3 pb-2 text-base outline-none disabled:opacity-60"
		></textarea>

		<div class="flex items-center gap-2 px-3 pb-2.5">
			{#if attachments}
				<input
					bind:this={picker}
					type="file"
					multiple
					accept={ACCEPT_ATTRIBUTE}
					onchange={pick}
					class="hidden"
					tabindex="-1"
					aria-hidden="true"
				/>
				<button
					type="button"
					onclick={() => picker?.click()}
					disabled={running || files.length >= MAX_FILES}
					aria-label="Attach a file"
					class="text-muted-foreground hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring flex size-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-30"
				>
					<PaperclipIcon class="size-4" />
				</button>
			{/if}

			{#if hasChoice}
				<div class="flex min-w-0 flex-wrap items-center gap-1">
					{#each choices as choice (choice.id)}
						<button
							type="button"
							onclick={() => onscope(choice.id)}
							class="max-w-full truncate rounded-full px-2 py-0.5 text-xs transition-colors {scope ===
							choice.id
								? 'bg-primary/15 text-foreground border-primary/40 border'
								: 'text-muted-foreground hover:text-foreground border border-transparent'}"
						>
							{choice.label}
						</button>
					{/each}
				</div>
			{/if}
			<span class="flex-1"></span>
			{#if running}
				<button
					type="button"
					onclick={onstop}
					aria-label="Stop"
					class="bg-foreground text-background hover:bg-foreground/90 flex size-8 items-center justify-center rounded-full transition-colors"
				>
					<SquareIcon class="size-3.5 fill-current" />
				</button>
			{:else}
				<button
					type="button"
					onclick={submit}
					disabled={!value.trim()}
					aria-label="Send"
					class="bg-primary text-primary-foreground hover:bg-primary/90 disabled:hover:bg-primary flex size-8 items-center justify-center rounded-full transition-all disabled:opacity-30"
				>
					<ArrowUpIcon class="size-4" />
				</button>
			{/if}
		</div>
	</div>

	{#if rejected}
		<p class="text-status-error px-1 pt-1.5 text-xs" role="status" aria-live="polite">{rejected}</p>
	{/if}
</div>
