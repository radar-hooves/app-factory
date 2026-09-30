<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';
	import { cn, type WithElementRef } from '$lib/utils.js';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		message: string;
		action?: Snippet;
	};

	let {
		message,
		action,
		ref = $bindable(null),
		class: className,
		...restProps
	}: Props = $props();
</script>

<!--
	This surface only ever mounts because an async load has already failed, so it
	interrupts. role="alert" is an assertive live region on its own; aria-live is
	written out beside it so the deliberate asymmetry with the sibling
	LoadingState (role="status" + aria-live="polite", because loading is not
	urgent) is legible at both call sites rather than resting on an implicit
	mapping the reader has to know.

	It is mounted already carrying its message. MDN counsels priming an empty
	role="alert" first and injecting the text after, but the ADG matrix has the
	populated-on-insert form passing NVDA and JAWS across Firefox, Chrome and
	Edge, and priming would cost a frame of empty box. VoiceOver/Safari is
	untested by that matrix — see harness/drive.md.
-->
<div
	bind:this={ref}
	class={cn(
		'bg-card border-destructive/40 ds-edge flex flex-col items-center justify-center rounded-lg border p-8 text-center',
		className
	)}
	role="alert"
	aria-live="assertive"
	{...restProps}
>
	<div class="bg-destructive/10 mb-4 rounded-full p-3">
		<AlertCircle class="text-destructive size-6" aria-hidden="true" />
	</div>
	<p class="text-destructive mb-4 max-w-sm text-sm">{message}</p>
	{#if action}
		{@render action()}
	{/if}
</div>
