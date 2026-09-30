<!--
  Today's fair-use allowance, beside the composer (from cadmus#114).

  One component for two states because they are one fact at two points: a
  quiet count while there are questions left, and a plain notice once there
  are none. Two components are how a count and a limit come to disagree about
  the same number.

  Read before a question is typed, so someone who is out learns it with an
  empty box rather than after three paragraphs. Nobody exempt reads anything,
  and neither does anyone where there is no limit: a counter that never moves
  is noise in the way of the box.
-->
<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';
	import type { Quota } from '../../chat.svelte';
	import { fill, resolveCopy, type LibrarianCopy } from '../../copy';

	interface Props {
		quota: Quota | null;
		/** Where to ask about the limit. Absent takes the allowance's own. */
		supportHref?: string;
		copy?: Partial<LibrarianCopy>;
	}

	let { quota, supportHref, copy }: Props = $props();

	const words = $derived(resolveCopy(copy));
	const shown = $derived(quota !== null && !quota.exempt && quota.limit > 0 ? quota : null);
	const href = $derived(supportHref ?? shown?.support_url ?? undefined);

	/** When it comes back, in the reader's own clock. */
	const resets = $derived.by(() => {
		const at = new Date(shown?.resets_at ?? '');
		if (Number.isNaN(at.getTime()) || (at.getHours() === 0 && at.getMinutes() === 0)) {
			return words.midnight;
		}
		return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	});
</script>

{#if shown?.reached}
	<div class="ds-lib-fair-use" role="status">
		<InfoIcon size={16} class="ds-lib-fair-use-icon" />
		<p>
			{fill(words.limitReached, { limit: shown.limit, resets })}
			{#if href}<a {href}>{words.support}</a>{/if}
		</p>
	</div>
{:else if shown}
	<p class="ds-lib-fair-use-count">
		{fill(words.questionsLeft, { remaining: shown.remaining, limit: shown.limit, resets })}
	</p>
{/if}

<style>
	.ds-lib-fair-use {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-lg);
		background: var(--ds-color-surface-2);
		padding: 0.5rem 0.75rem;
		color: var(--ds-color-foreground);
		font-size: 0.875rem;
	}

	.ds-lib-fair-use p {
		min-width: 0;
		margin: 0;
	}

	.ds-lib-fair-use :global(.ds-lib-fair-use-icon) {
		flex: none;
		margin-top: 0.125rem;
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-fair-use a {
		color: var(--ds-color-primary);
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.ds-lib-fair-use a:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-fair-use-count {
		margin: 0 0 0.375rem;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}
</style>
