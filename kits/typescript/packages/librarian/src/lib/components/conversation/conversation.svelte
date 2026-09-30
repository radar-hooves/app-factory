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
	import type { DescribeTool, Turn } from '../../transcript.svelte';
	import type { Verdict } from '../../chat.svelte';
	import type { Citation, LoadDocument } from '../../citations';
	import { DEFAULT_PERSONA, personaName, resolveCopy, type LibrarianCopy } from '../../copy';
	import { FollowScroll } from '../../follow-scroll.svelte';
	import AgentTranscript, {
		type AgentTranscriptProps
	} from '../agent-transcript/agent-transcript.svelte';
	import ArtefactPane from '../artefact-pane/artefact-pane.svelte';
	import DocumentPane from '../document-pane/document-pane.svelte';
	import ScopeStatement from '../scope-statement/scope-statement.svelte';

	/** What the reading column holds — a cited document or a study artefact,
	 *  never both and never two panes: whichever the reader last opened
	 *  replaces whatever was there. */
	type Column = { kind: 'document'; citation: Citation } | { kind: 'artefact'; turn: Turn } | null;

	interface Props {
		turns: Turn[];
		running: boolean;
		/** `Transcript.version` — bumped per event. Text grows in place, so a
		 *  count of turns is not enough to keep the scroll following. */
		version?: number;
		/** Who is speaking. A slug is fine — `penny` renders as "Penny" — and
		 *  every word this package says is composed from it: the working line,
		 *  the failure sentences, the scope label, the composer's placeholder
		 *  and the accessible name of the scroll region. Absent is the library's
		 *  own Milton, which is a default rather than a hardcoding. */
		name?: string;
		/** The empty state's opening line. Absent takes the persona's own. */
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
		/** Records a verdict on an answer. Offered on the last answer only, as
		 *  asking again is; without it no mark renders. */
		onmark?: (turn: Turn, verdict: Verdict) => Promise<boolean>;
		/** The last question waits behind somebody else's (`Chat.waiting`). */
		waiting?: boolean;
		/** When the last answer began, epoch ms, where this page did not see it
		 *  start (`Chat.answering`): it reads as still being written. */
		answering?: number | null;
		/** Overrides for the package's own words. */
		copy?: Partial<LibrarianCopy>;
		/** Enables the source pane. Without it, chips render but do not open. */
		loadDocument?: LoadDocument;
		/** Takes every citation tap instead, for a host that shows the source
		 *  in a viewer of its own. */
		oncite?: (citation: Citation) => void;
		/** Takes every artefact card's tap, for a host that shows an artefact
		 *  in a column of its own. Without it, an artefact that IS its answer
		 *  opens in this surface's own pane, and any other informs and does
		 *  not open. */
		onopenartefact?: (turn: Turn) => void;
		/** The id of the turn whose artefact the host is showing now. */
		showing?: string;
		/** The persona's own words for its tools, and what they read. */
		describeTool?: DescribeTool;
		collectionNames?: Set<string>;
		/** The composer, rendered INSIDE the transcript column so the source
		 *  pane narrows it too — a composer the host places outside slides
		 *  under the pane the moment one opens. */
		composer?: Snippet;
		/** Renders each turn in place of `AgentTranscript`, given the props it
		 *  would have taken: a host that presents an answer its own way (its
		 *  prose, its citation marks, its links) renders its own, and one that
		 *  only adds to it renders `AgentTranscript` inside it. */
		turn?: Snippet<[AgentTranscriptProps]>;
		/** Before the first turn, inside the scroll and under the opening and
		 *  the scope: what the host shows ahead of a question, which scrolls
		 *  with the conversation rather than taking its height. */
		lead?: Snippet;
	}

	let {
		turns,
		running,
		version = 0,
		name = DEFAULT_PERSONA,
		welcome,
		examples = [],
		onexample,
		scope,
		onregenerate,
		onsuggest,
		onmark,
		waiting = false,
		answering = null,
		copy,
		loadDocument,
		oncite,
		onopenartefact,
		showing,
		describeTool,
		collectionNames = new Set(),
		composer,
		turn: presentTurn,
		lead
	}: Props = $props();

	// Resolved ONCE, here, and handed down whole: every child takes `copy` and
	// none of them takes the name, so there is exactly one place a persona
	// turns into sentences.
	const words = $derived(resolveCopy(copy, name));
	const who = $derived(personaName(name));
	const opening = $derived(welcome ?? words.welcome);

	/**
	 * When each turn arrived, for the turns this surface actually watched
	 * arrive.
	 *
	 * A host that persists its conversations sets `turn.at` and that wins. A
	 * host that does not gets a stamp the moment a turn appears, which is true
	 * for a live turn and deliberately absent for one read back out of
	 * history — stamping those with `Date.now()` would print this afternoon
	 * against a question asked last week.
	 */
	let stamps = $state<Record<string, number>>({});

	let viewport = $state<HTMLElement | null>(null);
	let column = $state<Column>(null);
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
	let seen = -1;
	$effect(() => {
		if (seen >= 0 && turns.length > seen) {
			follow.pin();
			for (const turn of turns.slice(seen)) stamps[turn.id] ??= Date.now();
		}
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

	// Asking for a briefing puts its card in the transcript AND opens the
	// artefact in the column, closing whatever document was there — a
	// colleague who just asked for one is asking to read it, not merely to
	// see that it exists. Fires on the RUNNING → settled transition only, so
	// reopening a past conversation whose last turn happens to be an
	// artefact does not reopen a pane the reader may have since closed. A
	// host that opens artefacts itself decides this for itself.
	//
	// Plain, not `$state`: read and written in the same effect, which would
	// otherwise re-trigger itself forever (the pattern this file's `seen`
	// already uses for the same reason).
	let wasRunning = false;
	$effect(() => {
		const last = turns.at(-1);
		if (
			!onopenartefact &&
			wasRunning &&
			!running &&
			last?.artefact?.isAnswer &&
			!last.outcome?.isError
		) {
			column = { kind: 'artefact', turn: last };
		}
		wasRunning = running;
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
		if (oncite) return oncite(citation);
		// A citation derived from the prose has no id to read, so its chip is
		// legible but inert rather than opening an empty pane. Replaces
		// whatever the column held, artefact included — never a second pane.
		if (loadDocument && citation.document_id) column = { kind: 'document', citation };
	}

	/** Who opens this turn's artefact, if anyone can. */
	function opener(turn: Turn): (() => void) | undefined {
		if (onopenartefact) return () => onopenartefact(turn);
		if (turn.artefact?.isAnswer) return () => (column = { kind: 'artefact', turn });
		return undefined;
	}

	function isShowing(turn: Turn): boolean {
		if (onopenartefact) return showing === turn.id;
		return column?.kind === 'artefact' && column.turn.id === turn.id;
	}

	// Lifts the shell's report button (`@poodle64/ui` ReportWidget) clear of
	// Send, which shares its corner. Set on the document because the button
	// renders outside this subtree; a constant because Send is always the
	// composer's last row.
	$effect(() => {
		if (!composer || typeof document === 'undefined') return;
		document.documentElement.style.setProperty('--ds-report-clearance', '4.5rem');
		return () => document.documentElement.style.removeProperty('--ds-report-clearance');
	});
</script>

<div class="ds-lib-surface">
	<div class="ds-lib-main">
		<!-- The pill is positioned against the SCROLL region, not the column: the
		     composer is in the column too, and a pill over the input is a pill in
		     the way. -->
		<div class="ds-lib-scroll-region">
			<div
				bind:this={viewport}
				onscroll={scrolled}
				role="log"
				aria-live="polite"
				aria-busy={running}
				aria-label={words.conversationLabel}
				class="ds-lib-scroll"
			>
				<!-- The measure, in this package's own stylesheet.
				     `--ds-lib-measure` is the one knob a host may turn, and it is a
				     token rather than a class precisely because a class here is a
				     string a consuming app's Tailwind has to find in `dist` — the
				     arrangement that silently produced `max-width: none` and a
				     2302px line in Pebblestone's production build. -->
				<div class="ds-lib-column">
					{#if turns.length === 0}
						<div class="ds-lib-empty">
							<p class="ds-lib-welcome">{opening}</p>
							{#if examples.length > 0}
								<ul class="ds-lib-chips">
									{#each examples.slice(0, 3) as example (example)}
										<li>
											<button type="button" class="ds-lib-chip" onclick={() => onexample?.(example)}>
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
						<ScopeStatement statement={scope} expanded={turns.length === 0} copy={words} />
					{/if}

					{@render lead?.()}

					{#each turns as turn, index (turn.id)}
						{@const last = index === turns.length - 1}
						{@const props = {
							question: turn.question,
							blocks: turn.blocks,
							outcome: turn.outcome,
							running: running && last,
							waiting: waiting && last,
							answering: last ? (answering ?? undefined) : undefined,
							citations: turn.citations ?? [],
							suggestions: turn.suggestions ?? [],
							collectionNames,
							copy: words,
							name: who,
							at: turn.at ?? stamps[turn.id],
							artefact: turn.artefact,
							artefactOpen: isShowing(turn),
							onopenartefact: opener(turn),
							describeTool,
							oncite: oncite || loadDocument ? cite : undefined,
							onregenerate: last && !running ? onregenerate : undefined,
							onsuggest: last && !running ? onsuggest : undefined,
							onmark:
								last && !running && onmark ? (verdict: Verdict) => onmark(turn, verdict) : undefined
						} satisfies AgentTranscriptProps}
						{#if presentTurn}
							{@render presentTurn(props)}
						{:else}
							<AgentTranscript {...props} />
						{/if}
					{/each}
				</div>
			</div>

			{#if !follow.following && turns.length > 0}
				<button type="button" class="ds-lib-jump" onclick={jump}>
					<ArrowDownIcon size={14} />
					{words.jumpToLatest}
				</button>
			{/if}
		</div>

		{#if composer}
			<!-- Lifted off the scroll area, and on the app's own background rather
			     than the transcript's: prose scrolling up to the exact edge of the
			     input is the one place a reader loses track of which is which. -->
			<div class="ds-lib-composer">
				<div class="ds-lib-column ds-lib-column-flush">{@render composer()}</div>
			</div>
		{/if}
	</div>

	{#if column?.kind === 'document' && loadDocument}
		<DocumentPane
			citation={column.citation}
			{loadDocument}
			copy={words}
			onclose={() => (column = null)}
		/>
	{:else if column?.kind === 'artefact'}
		<ArtefactPane
			turn={column.turn}
			copy={words}
			onclose={() => (column = null)}
			oncite={(citation) => cite(citation)}
		/>
	{/if}
</div>

<style>
	/* `min-width: 0` for a host that sets this in a row beside columns of its
	   own: a flex item's automatic minimum is its widest content, and a table
	   in an answer then pushed the whole page sideways at 390. */
	.ds-lib-surface {
		display: flex;
		min-width: 0;
		min-height: 0;
		flex: 1;
	}

	.ds-lib-main {
		display: flex;
		min-width: 0;
		min-height: 0;
		flex: 1;
		flex-direction: column;
	}

	.ds-lib-scroll-region {
		position: relative;
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
	}

	.ds-lib-scroll {
		min-height: 0;
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.ds-lib-column {
		display: flex;
		width: 100%;
		max-width: var(--ds-lib-measure, 46rem);
		flex-direction: column;
		gap: 1.5rem;
		margin-inline: auto;
		padding: 1.5rem 1rem;
	}

	.ds-lib-column-flush {
		gap: 0;
		padding: 0;
	}

	.ds-lib-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1rem;
		padding-block: 2rem;
	}

	.ds-lib-welcome {
		max-width: 46ch;
		margin: 0;
		color: var(--ds-color-foreground);
		font-size: 1.125rem;
		line-height: 1.375;
	}

	.ds-lib-chips {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.ds-lib-chips li {
		max-width: 100%;
	}

	.ds-lib-chip {
		max-width: 100%;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-full);
		background: none;
		padding: 0.5rem 0.875rem;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: 0.875rem;
		text-align: start;
		cursor: pointer;
		transition:
			background-color 150ms ease,
			border-color 150ms ease;
	}

	.ds-lib-chip:hover {
		border-color: var(--ds-color-border-strong);
		background: var(--ds-color-surface-2);
	}

	.ds-lib-chip:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-jump {
		position: absolute;
		bottom: 0.75rem;
		left: 50%;
		display: flex;
		align-items: center;
		gap: 0.375rem;
		transform: translateX(-50%);
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-full);
		background: var(--ds-color-surface-1);
		padding: 0.375rem 0.75rem;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: var(--ds-text-2xs);
		cursor: pointer;
		box-shadow: 0 8px 20px rgb(0 0 0 / 0.18);
		transition: background-color 150ms ease;
	}

	.ds-lib-jump:hover {
		background: var(--ds-color-surface-2);
	}

	.ds-lib-jump:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-composer {
		flex: none;
		border-top: 1px solid var(--ds-color-border);
		background: var(--ds-color-background);
		padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
	}
</style>
