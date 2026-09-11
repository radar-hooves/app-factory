<!--
  A study artefact, open in the reading column.

  The same shell shape `DocumentPane` uses (a column at `lg`, a bottom sheet
  below it) because decision 2 of the ask-milton surface is that a colleague
  never has to learn which of the two things is in the column before they
  open it — only ever one, in the same place, closing whichever was there.
-->
<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { segment, type TextBlock, type Turn } from '../../transcript.svelte';
	import { resolveCitations, splitSources, trustMark, type Citation } from '../../citations';
	import { resolveCopy, type LibrarianCopy } from '../../copy';
	import Markdown from '../markdown/markdown.svelte';

	interface Props {
		turn: Turn;
		onclose: () => void;
		/** Opens the cited document instead — swapping the column back, never
		 *  stacking it beside the artefact. Omit and the sources still list, but
		 *  do not open. */
		oncite?: (citation: Citation) => void;
		copy?: Partial<LibrarianCopy>;
	}

	let { turn, onclose, oncite, copy }: Props = $props();

	const words = $derived(resolveCopy(copy));

	const texts = $derived(segment(turn.blocks).filter((s): s is TextBlock => s.kind === 'text'));
	const rawAnswer = $derived(texts.map((t) => t.text).join('\n\n'));
	const split = $derived(splitSources(rawAnswer));
	const sources = $derived(resolveCitations(turn.citations ?? [], split.citations));

	let closeButton = $state<HTMLButtonElement | null>(null);

	// Opening a pane a reader reached with the keyboard must move focus into
	// it, or Escape and Tab both act on the transcript behind it.
	$effect(() => {
		const returnTo = globalThis.document?.activeElement as HTMLElement | null;
		closeButton?.focus();
		return () => returnTo?.focus?.();
	});

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={keydown} />

<aside
	aria-label="Study artefact"
	class="bg-surface-1 border-border fixed inset-x-0 bottom-0 z-40 flex h-[80svh] flex-col rounded-t-2xl border-t shadow-2xl lg:relative lg:h-auto lg:w-[560px] lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none"
>
	<!-- The sheet's grabber. Below `lg` this is an overlay a reader has to be
	     able to see the top edge of; on a desktop it is a column, so there is
	     nothing here to grab. -->
	<div class="flex justify-center pt-2 pb-1 lg:hidden" aria-hidden="true">
		<span class="bg-border h-1 w-9 rounded-full"></span>
	</div>

	<header class="border-border flex items-start gap-2 border-b px-4 py-3 lg:pt-3">
		<div class="min-w-0 flex-1">
			<h2 class="text-foreground truncate text-sm font-semibold">{turn.title ?? 'Briefing'}</h2>
			<p class="text-muted-foreground truncate text-xs">
				Briefing doc · {sources.length} source{sources.length === 1 ? '' : 's'}
			</p>
		</div>
		<button
			bind:this={closeButton}
			type="button"
			onclick={onclose}
			aria-label={words.closeSource}
			class="text-muted-foreground hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
		>
			<XIcon class="size-4" />
		</button>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
		<Markdown content={split.citations.length > 0 ? split.body : rawAnswer} />

		{#if sources.length > 0}
			<section class="mt-6">
				<h3 class="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
					{words.sources}
				</h3>
				<ol class="flex flex-col gap-1">
					{#each sources as source (source.n)}
						{@const mark = trustMark(source, words)}
						<li>
							<button
								type="button"
								onclick={() => oncite?.(source)}
								disabled={!source.document_id || !oncite}
								class="border-border hover:border-border-strong hover:bg-surface-2 focus-visible:ring-ring flex w-full items-baseline gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent"
							>
								<span
									class="bg-primary/15 text-foreground shrink-0 rounded px-1.5 font-mono text-xs tabular-nums"
									>{source.n}</span
								>
								<span class="min-w-0">
									<span class="text-foreground">{source.title}</span>
									{#if source.section}<span class="text-muted-foreground">
											· {source.section}</span
										>{/if}
									{#if mark}<span class="text-muted-foreground/80"> · {mark}</span>{/if}
								</span>
							</button>
						</li>
					{/each}
				</ol>
			</section>
		{/if}
	</div>
</aside>
