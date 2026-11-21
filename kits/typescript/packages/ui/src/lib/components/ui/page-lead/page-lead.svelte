<script lang="ts">
	/**
	 * A page's lead: the one sentence that answers what the reader came for
	 * ("Nothing new since 24/10"), with a label, a subtitle and the facts that
	 * go with it. It is the largest type on the page, so the eye starts there. It is the page's content, never its title: the shell's
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
		icon,
		class: className,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		/** The answer, in one sentence. */
		lead: string;
		/** A short label above it, in sentence case. */
		eyebrow?: string;
		subtitle?: string;
		/** Facts about the answer, under it: badges, dates, a status. */
		meta?: Snippet;
		/** The mark of the thing the lead is about (a record type's icon), drawn beside the lead. */
		icon?: Snippet;
	} = $props();
</script>

<div data-slot="page-lead" class={cn('min-w-0', className)} {...restProps}>
	{#if eyebrow}
		<div class="ds-label mb-1.5">{eyebrow}</div>
	{/if}
	<div class="flex min-w-0 items-center gap-2.5">
		{#if icon}
			<span class="text-muted-foreground grid size-6 flex-none place-items-center" data-slot="page-lead-icon">
				{@render icon()}
			</span>
		{/if}
		<h2
			class="font-display text-display max-w-3xl font-semibold tracking-[var(--ds-font-display-tracking,-0.02em)]"
			data-answer
		>
			{lead}
		</h2>
	</div>
	{#if subtitle}
		<p class="text-muted-foreground mt-2 max-w-3xl text-base">{subtitle}</p>
	{/if}
	{#if meta}
		<div
			class="text-muted-foreground mt-3 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1.5 text-sm"
		>
			{@render meta()}
		</div>
	{/if}
</div>
