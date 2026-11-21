<script lang="ts">
	import type { Snippet, Component } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '#lib/utils.js';

	// The generic titled section. Where DetailPanel is the *entity* surface (and
	// owns a status and a close affordance), Panel is the plain section any route
	// reaches for: a heading over a hairline, with icon, subtitle and trailing
	// actions, over a body that can opt out of its top padding for a flush table.
	// Open, never a box: a bordered card around every section is the stock
	// generated look (app-factory#171).
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
		 * A short qualifier under the title. It WRAPS: a header is as tall as its
		 * text, so a phone shows the whole qualifier rather than "Profit and l…".
		 *
		 * For the sentence or two that explains what the section is for, use
		 * `description`, which sits in the same place with more room. Carry one
		 * or the other, not both.
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
		 * The section's actions — a Save/Cancel pair — over a hairline at the
		 * foot, right-aligned.
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
		 * The body scrolls inside the section, under a header that stays: the section
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
	data-fill={scroll ? '' : undefined}
	class={cn(
		'flex min-h-0 flex-col',
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
				'flex gap-2.5 border-b pb-2.5',
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
						'text-heading font-semibold',
						destructive && 'text-destructive'
					)}
				>
					{title}
				</h2>
				{#if subtitle}
					<p class="text-muted-foreground text-xs break-words">{subtitle}</p>
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
	<div class={cn(pad && 'pt-4', scroll && 'min-h-0 flex-1 overflow-y-auto')} data-slot="panel-body">
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
				'mt-auto flex items-center justify-end gap-2 border-t pt-3',
				destructive ? 'border-destructive/25' : 'border-border'
			)}
			data-slot="panel-footer"
		>
			{@render footer()}
		</div>
	{/if}
</section>
