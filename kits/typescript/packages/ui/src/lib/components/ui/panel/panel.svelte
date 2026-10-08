<script lang="ts">
	import type { Snippet, Component } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	// The generic titled card. Where DetailPanel is the *entity* surface (and owns
	// a status and a close affordance), Panel is the plain sectioning card any
	// route reaches for: an optional header with icon, subtitle and trailing
	// actions, over a body that can opt out of padding for a flush table.
	//
	// It is also the settings SECTION, and there is no second component for that.
	// A `SettingsSection` would have been this card with a different name — same
	// surface, same header, same title — and the estate would then hold two
	// answers to "a titled section of a route", which is the drift this package
	// exists to end. What settings actually needed that this did not have is three
	// props, and all three serve any route: a description that wraps, a footer for
	// the Save/Cancel pair, and a destructive tone for a danger zone.
	let {
		title,
		subtitle,
		description,
		icon: Icon,
		action,
		footer,
		tone = 'default',
		children,
		pad = true,
		scroll = false,
		class: klass = '',
		ref = $bindable(null),
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		title?: string;
		/**
		 * A one-line qualifier beside the title. It TRUNCATES, and every existing
		 * call site is written against that: a panel header is one rhythm, and a
		 * subtitle that wrapped would change it everywhere at once.
		 *
		 * For the sentence or two that explains what the section is for, use
		 * `description`, which wraps. Carry one or the other, not both.
		 */
		subtitle?: string;
		/**
		 * The sentence or two under the title, wrapped, explaining what this
		 * section does or what changing it costs.
		 *
		 * PageHeader deliberately has no equivalent — a page's long explanation
		 * goes in its `info` tip so no route carries a standing explainer banner —
		 * and that position does not carry down to here. A settings section's
		 * description IS the setting's meaning ("who can approve a bill, and up to
		 * what value"), and hiding it behind an (i) on the one destination whose
		 * whole job is explaining consequential toggles is worse than the banner
		 * that rule was written against. GitHub, Linear, Vercel and Stripe all
		 * wrap a description under the section title.
		 */
		description?: string;
		icon?: Component<{ class?: string }>;
		action?: Snippet;
		/**
		 * The section's actions — a Save/Cancel pair — on a top-bordered muted
		 * strip at the foot, right-aligned. Same treatment as CardFooter's, so a
		 * panel's foot and a card's foot are the same foot.
		 */
		footer?: Snippet;
		/**
		 * `destructive` is the danger zone: a section whose controls delete or
		 * revoke something. It moves the rule and the title to the destructive
		 * ink — the treatment Alert and Button already use for it — and nothing
		 * else, so the section is marked without being shouted.
		 */
		tone?: 'default' | 'destructive';
		children: Snippet;
		pad?: boolean;
		/**
		 * The body scrolls inside the card, under a header that stays: the card
		 * is as tall as what it holds up to the height its container gives it,
		 * and the full height when given one (`h-full`).
		 */
		scroll?: boolean;
	} = $props();

	const destructive = $derived(tone === 'destructive');
</script>

<section
	bind:this={ref}
	data-tone={tone === 'default' ? undefined : tone}
	class={cn(
		'bg-card ds-edge flex flex-col overflow-hidden rounded-lg border',
		destructive ? 'border-destructive/40' : 'border-border',
		klass
	)}
	{...restProps}
>
	{#if title}
		<!--
			`items-start` once a description is present: a wrapping description makes
			the title block taller than the action row, and centring the actions
			against three lines of prose floats them in the middle of the header.
		-->
		<header
			class={cn(
				'flex gap-2.5 border-b px-4 py-3',
				description ? 'items-start' : 'items-center',
				destructive ? 'border-destructive/25' : 'border-border'
			)}
		>
			{#if Icon}
				<Icon
					class={cn('size-4', destructive ? 'text-destructive' : 'text-muted-foreground')}
				/>
			{/if}
			<div class="min-w-0">
				<h2
					class={cn(
						'text-body leading-tight font-semibold tracking-tight',
						destructive && 'text-destructive'
					)}
				>
					{title}
				</h2>
				{#if subtitle}
					<p class="text-muted-foreground truncate text-xs">{subtitle}</p>
				{/if}
				{#if description}
					<p class="text-muted-foreground mt-1 text-sm">{description}</p>
				{/if}
			</div>
			{#if action}
				<div class="ml-auto flex items-center gap-1.5">{@render action()}</div>
			{/if}
		</header>
	{/if}
	<div class={cn(pad && 'p-4', scroll && 'min-h-0 flex-1 overflow-y-auto')} data-slot="panel-body">
		{@render children()}
	</div>
	{#if footer}
		<!--
			`mt-auto` so a footer sits at the bottom of a panel that has been given a
			height (a fixed-height column, a grid row) rather than floating under
			short content.
		-->
		<div
			class={cn(
				'bg-muted/50 mt-auto flex items-center justify-end gap-2 border-t px-4 py-3',
				destructive ? 'border-destructive/25' : 'border-border'
			)}
			data-slot="panel-footer"
		>
			{@render footer()}
		</div>
	{/if}
</section>
