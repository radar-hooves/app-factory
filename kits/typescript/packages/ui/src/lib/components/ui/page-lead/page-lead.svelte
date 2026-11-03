<script lang="ts">
	/**
	 * A page's lead: the one sentence that answers what the reader came for
	 * ("Nothing new since 24/10"), with an eyebrow, a subtitle and the facts
	 * that go with it. It is the page's content, never its title: the shell's
	 * bar names the page, and this is a second-level heading under that name.
	 * The page's actions go to the bar (`ShellActions`), not here.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '#lib/utils.js';

	let {
		lead,
		eyebrow,
		subtitle,
		meta,
		class: className,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		/** The answer, in one sentence. */
		lead: string;
		/** A short kicker above it. */
		eyebrow?: string;
		subtitle?: string;
		/** Facts about the answer, under it: badges, dates, a status. */
		meta?: Snippet;
	} = $props();
</script>

<div data-slot="page-lead" class={cn('min-w-0', className)} {...restProps}>
	{#if eyebrow}
		<div class="text-primary text-2xs tracking-eyebrow mb-1 font-medium uppercase">{eyebrow}</div>
	{/if}
	<h2 class="font-display max-w-3xl text-xl leading-snug font-semibold" data-answer>{lead}</h2>
	{#if subtitle}
		<p class="text-muted-foreground mt-1.5 max-w-4xl text-sm">{subtitle}</p>
	{/if}
	{#if meta}
		<div
			class="text-muted-foreground mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-xs"
		>
			{@render meta()}
		</div>
	{/if}
</div>
