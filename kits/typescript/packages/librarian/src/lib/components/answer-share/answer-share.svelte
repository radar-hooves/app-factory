<!--
  Share one answer read-only with whoever may ask here, and stop sharing it.

  Rendered by `AgentTranscript` in its action row, and by a host's own turn
  beside its own presentation, only when the host passes `onshare`: nothing
  is shared unless the reader asks. A share copies its link at once; a
  browser that refuses a copy after the round trip (Safari) still has "Copy
  link". Several roots, as `AnswerMark`: the buttons sit in the row, and the
  line saying who can open it drops under it.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import LinkIcon from '@lucide/svelte/icons/link';
	import Share2Icon from '@lucide/svelte/icons/share-2';
	import { resolveCopy, type LibrarianCopy } from '../../copy';

	interface Props {
		/** Shares the answer (true) or stops sharing it (false), resolving true
		 *  once recorded. */
		onshare: (share: boolean) => Promise<boolean>;
		/** Where the read-only view lives while the answer is shared, as the
		 *  host's own address. */
		shared?: string;
		copy?: Partial<LibrarianCopy>;
	}

	let { onshare, shared, copy }: Props = $props();

	const words = $derived(resolveCopy(copy));

	let saving = $state(false);
	let failed = $state(false);
	let copied = $state(false);

	async function send(share: boolean) {
		if (saving) return;
		saving = true;
		failed = false;
		try {
			failed = !(await onshare(share));
		} finally {
			saving = false;
		}
		if (share && !failed) {
			await tick();
			await copyLink();
		}
	}

	async function copyLink() {
		if (!shared) return;
		try {
			await navigator.clipboard.writeText(new URL(shared, location.href).href);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			// Refused; "Copy link" is still there to tap.
		}
	}
</script>

{#if shared}
	<button type="button" class="ds-lib-share" onclick={copyLink} disabled={saving}>
		{#if copied}<CheckIcon size={14} />{:else}<LinkIcon size={14} />{/if}
		<span>{copied ? words.linkCopied : words.copyLink}</span>
	</button>
	<button type="button" class="ds-lib-share" onclick={() => send(false)} disabled={saving}>
		<span>{words.stopSharing}</span>
	</button>
{:else}
	<button type="button" class="ds-lib-share" onclick={() => send(true)} disabled={saving}>
		<Share2Icon size={14} />
		<span>{words.share}</span>
	</button>
{/if}
{#if shared || failed}
	<p class="ds-lib-share-line" class:is-failed={failed} role="status">
		{failed ? words.shareFailed : words.sharedWith}
	</p>
{/if}

<style>
	/* 44px tall: a thumb's target on a phone. */
	.ds-lib-share {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.375rem;
		border: 0;
		border-radius: var(--ds-radius-md);
		background: none;
		padding: 0.25rem 0.375rem;
		color: inherit;
		font: inherit;
		font-size: var(--ds-text-2xs);
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease;
	}

	.ds-lib-share:hover:not(:disabled) {
		background: var(--ds-color-surface-1);
		color: var(--ds-color-foreground);
	}

	.ds-lib-share:disabled {
		cursor: default;
		opacity: 0.6;
	}

	.ds-lib-share:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	/* Its own line under the row, whatever sits after the buttons in it. */
	.ds-lib-share-line {
		order: 1;
		flex-basis: 100%;
		margin: 0 0 0 0.375rem;
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-share-line.is-failed {
		color: var(--ds-color-status-error);
	}
</style>
