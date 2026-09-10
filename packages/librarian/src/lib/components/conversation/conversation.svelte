<!--
  The whole reading surface: every turn, the scroll that follows the stream,
  and the source pane beside it.

  This owns the SCROLL CONTAINER, which is the reason it exists rather than the
  host composing `AgentTranscript` in a div of its own. Follow-scroll, the
  jump-to-latest pill and a document pane that narrows the transcript instead
  of covering it are all one question — where the overflow lives — and three
  hosts answering it separately is three chances to answer it differently.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import type { Turn } from '../../transcript.svelte';
	import type { Citation, LoadDocument } from '../../citations';
	import { resolveCopy, type LibrarianCopy } from '../../copy';
	import { FollowScroll } from '../../follow-scroll.svelte';
	import AgentTranscript from '../agent-transcript/agent-transcript.svelte';
	import DocumentPane from '../document-pane/document-pane.svelte';
	import ScopeStatement from '../scope-statement/scope-statement.svelte';

	interface Props {
		turns: Turn[];
		running: boolean;
		/** `Transcript.version` — bumped per event. Text grows in place, so a
		 *  count of turns is not enough to keep the scroll following. */
		version?: number;
		welcome?: string;
		/** Up to three, shown in the empty state as tappable pills. */
		examples?: string[];
		onexample?: (question: string) => void;
		/** What this surface answers from and what it does not hold, in the
		 *  host's own words. One statement per room, above the first turn,
		 *  folded once the conversation starts. */
		scope?: string;
		/** Re-asks the last question. Offered on the last answer only. */
		onregenerate?: () => void;
		/** Asks a follow-up the librarian suggested. Offered on the last answer
		 *  only; without it the suggestion chips do not render. */
		onsuggest?: (question: string) => void;
		/** Overrides for the package's own words. */
		copy?: Partial<LibrarianCopy>;
		/** Enables the source pane. Without it, chips render but do not open. */
		loadDocument?: LoadDocument;
		collectionNames?: Set<string>;
		/** The composer, rendered INSIDE the transcript column so the source
		 *  pane narrows it too — a composer the host places outside slides
		 *  under the pane the moment one opens. */
		composer?: Snippet;
	}

	let {
		turns,
		running,
		version = 0,
		welcome = 'Ask Milton a question about the library.',
		examples = [],
		onexample,
		scope,
		onregenerate,
		onsuggest,
		copy,
		loadDocument,
		collectionNames = new Set(),
		composer
	}: Props = $props();

	const words = $derived(resolveCopy(copy));

	let viewport = $state<HTMLElement | null>(null);
	let open = $state<Citation | null>(null);
	const follow = new FollowScroll();

	function metrics(el: HTMLElement) {
		return {
			scrollTop: el.scrollTop,
			clientHeight: el.clientHeight,
			scrollHeight: el.scrollHeight
		};
	}

	// A new question re-pins: the reader asked for the thing about to arrive,
	// even if they were reading something further up when they asked.
	//
	// Deliberately NOT `$state`: an effect that both reads and writes one piece
	// of reactive state re-triggers itself, which Svelte stops with
	// `effect_update_depth_exceeded` — measured, on this component. Nothing
	// renders this, so a plain variable is both correct and enough.
	let seen = 0;
	$effect(() => {
		if (turns.length > seen) follow.pin();
		seen = turns.length;
	});

	$effect(() => {
		// Both dependencies are deliberate: `version` for text growing inside an
		// existing block, `turns.length` for a whole new turn.
		void version;
		void turns.length;
		if (!viewport || !follow.following) return;
		viewport.scrollTop = viewport.scrollHeight;
	});

	function scrolled() {
		if (viewport) follow.measure(metrics(viewport));
	}

	function jump() {
		if (!viewport) return;
		follow.pin();
		viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
	}

	function cite(citation: Citation) {
		// A citation derived from the prose has no id to read, so its chip is
		// legible but inert rather than opening an empty pane.
		if (loadDocument && citation.document_id) open = citation;
	}
</script>

<div class="flex min-h-0 flex-1">
	<div class="flex min-h-0 min-w-0 flex-1 flex-col">
		<!-- The pill is positioned against the SCROLL region, not the column: the
		     composer is in the column too, and a pill over the input is a pill in
		     the way. -->
		<div class="relative flex min-h-0 flex-1 flex-col">
		<div
			bind:this={viewport}
			onscroll={scrolled}
			role="log"
			aria-live="polite"
			aria-busy={running}
			aria-label="Conversation with Milton"
			class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
		>
			<div class="mx-auto flex w-full max-w-[46rem] flex-col gap-8 px-4 py-6">
				{#if turns.length === 0}
					<div class="flex flex-col items-start gap-4 py-8">
						<p class="text-foreground max-w-[46ch] text-lg leading-snug">{welcome}</p>
						{#if examples.length > 0}
							<ul class="flex flex-col items-start gap-2">
								{#each examples.slice(0, 3) as example (example)}
									<li class="max-w-full">
										<button
											type="button"
											onclick={() => onexample?.(example)}
											class="border-border hover:border-border-strong hover:bg-surface-2 focus-visible:ring-ring text-foreground max-w-full rounded-full border px-3.5 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
										>
											{example}
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}

				<!-- Above the first turn, and in ONE place in the markup: the empty
				     state carries the welcome, this carries the boundary, and both
				     sit at the top of the same column so a reader meets them in
				     the same order whether or not they have asked anything yet. -->
				{#if scope}
					<ScopeStatement statement={scope} expanded={turns.length === 0} {copy} />
				{/if}

				{#each turns as turn, index (turn.id)}
					<AgentTranscript
						question={turn.question}
						blocks={turn.blocks}
						outcome={turn.outcome}
						running={running && index === turns.length - 1}
						citations={turn.citations ?? []}
						suggestions={turn.suggestions ?? []}
						{collectionNames}
						{copy}
						oncite={cite}
						onregenerate={index === turns.length - 1 && !running ? onregenerate : undefined}
						onsuggest={index === turns.length - 1 && !running ? onsuggest : undefined}
					/>
				{/each}
			</div>
		</div>

		{#if !follow.following && turns.length > 0}
			<button
				type="button"
				onclick={jump}
				class="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
			>
				<ArrowDownIcon class="size-3.5" />
				{words.jumpToLatest}
			</button>
		{/if}
		</div>

		{#if composer}
			<div class="shrink-0 px-4 pb-3">
				<div class="mx-auto w-full max-w-[46rem]">{@render composer()}</div>
			</div>
		{/if}

	</div>

	{#if open && loadDocument}
		<DocumentPane citation={open} {loadDocument} {copy} onclose={() => (open = null)} />
	{/if}
</div>
