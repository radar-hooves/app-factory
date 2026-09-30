<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	// A compact dot-row health strip: several independent 0/1/2 checks read at
	// a glance (e.g. one dot per dependency) where a StatCard's single figure
	// or a StatusBadge's single pill cannot represent more than one state at
	// once. Reuses the package's own .ds-dot status colours rather than
	// inventing a second dot vocabulary.
	const TONE_LABEL = ['off', 'on', 'warn'] as const;
	const TONE_CLASS = ['ds-dot-error', 'ds-dot-success', 'ds-dot-warning'] as const;

	let {
		scores,
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		scores: (0 | 1 | 2)[];
	} = $props();

	const summary = $derived(scores.map((s) => TONE_LABEL[s]).join(', '));
</script>

<span
	bind:this={ref}
	class={cn('inline-flex gap-[0.22rem]', className)}
	role="img"
	aria-label={summary}
	{...restProps}
>
	{#each scores as s, i (i)}
		<i class={cn('ds-dot', TONE_CLASS[s])}></i>
	{/each}
</span>
