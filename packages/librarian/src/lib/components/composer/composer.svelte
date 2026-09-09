<!--
  The composer: one rounded box holding the input AND a footer row.

  Two things carry it: the chips sit BELOW the input inside the same box
  rather than beside it, and the trailing control is a circular filled accent
  button. The empty→typing transition lives almost entirely in that control —
  the box chrome does not resize.

  The composer stays enabled while the agent works. Queuing the next message
  is not built yet; disabling the box would be a different and worse
  behaviour than the one being copied, so it is not disabled.
-->
<script lang="ts">
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import SquareIcon from '@lucide/svelte/icons/square';

	export type Scope = 'document' | 'collection' | 'library';

	interface Props {
		value: string;
		running: boolean;
		scope: Scope;
		/** Names for the two narrower scopes; absent means that scope is unavailable. */
		documentName?: string;
		collectionName?: string;
		onscope: (scope: Scope) => void;
		onsubmit: () => void;
		onstop: () => void;
	}

	let {
		value = $bindable(),
		running,
		scope,
		documentName,
		collectionName,
		onscope,
		onsubmit,
		onstop
	}: Props = $props();

	// What the agent is being asked about — chat with this document, this
	// collection, or the whole library. Callers that have no narrower scope
	// pass neither name, leaving "All collections" the sole entry — and a
	// sole entry is not a choice, so `hasChoice` below hides it rather than
	// rendering a chip with nothing to switch to.
	const choices = $derived(
		[
			documentName ? { id: 'document' as const, label: documentName } : null,
			collectionName ? { id: 'collection' as const, label: collectionName } : null,
			{ id: 'library' as const, label: 'All collections' }
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

	function keydown(event: KeyboardEvent) {
		// Enter sends, Shift+Enter breaks the line — the convention in every
		// reference and the one a user will try first.
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			if (value.trim()) onsubmit();
		}
	}
</script>

<div
	class="border-border bg-surface-1 focus-within:border-primary/60 rounded-xl border transition-colors"
>
	<textarea
		bind:value
		onkeydown={keydown}
		rows="2"
		placeholder={running ? 'Queue another message…' : 'Ask anything'}
		class="text-foreground placeholder:text-muted-foreground max-h-52 w-full resize-none bg-transparent px-4 pt-3 pb-2 text-base outline-none"
	></textarea>

	<div class="flex items-center gap-2 px-3 pb-2.5">
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
				onclick={onsubmit}
				disabled={!value.trim()}
				aria-label="Send"
				class="bg-primary text-primary-foreground hover:bg-primary/90 disabled:hover:bg-primary flex size-8 items-center justify-center rounded-full transition-all disabled:opacity-30"
			>
				<ArrowUpIcon class="size-4" />
			</button>
		{/if}
	</div>
</div>
