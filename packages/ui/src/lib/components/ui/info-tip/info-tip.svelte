<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Tooltip from '../tooltip/index.js';
	import Info from '@lucide/svelte/icons/info';

	// One tooltip pattern for the whole app. Pass `text` for the hint; wrap an
	// existing affordance by passing it as children (e.g. a status dot or a
	// capability chip), or omit children to render a small info icon trigger.
	let {
		text,
		side = 'top',
		children,
		class:
			className = 'text-muted-foreground/60 hover:text-muted-foreground size-3.5 transition-colors'
	}: {
		text: string;
		side?: 'top' | 'right' | 'bottom' | 'left';
		children?: Snippet;
		class?: string;
	} = $props();
</script>

<Tooltip.Provider delayDuration={150}>
	<Tooltip.Root>
		<!--
			The icon trigger takes a 44x44 hit area (`size-11`) and hands the space
			straight back (`-m-3.5`), so the glyph, the row it sits in and the
			spacing around it are all exactly as before and only a thumb can tell
			the difference. Measured on one consumer at 390 px: this button was
			16x16 on every page header carrying `info`, well under Apple's 44 pt
			floor, and it is the package's button on every consumer's page.

			Only the bare icon form gets it. Where `children` are passed the trigger
			wraps an affordance the app already sized — a status dot inline in a
			sentence, a chip in a row — and a 44 px box around one of those moves
			the layout it was placed in.
		-->
		<Tooltip.Trigger
			class="inline-flex cursor-help items-center align-middle {children
				? ''
				: '-m-3.5 size-11 justify-center'}"
		>
			{#if children}
				{@render children()}
			{:else}
				<Info class={className} aria-hidden="true" />
			{/if}
			<span class="sr-only">{text}</span>
		</Tooltip.Trigger>
		<Tooltip.Content {side} class="max-w-xs text-xs">
			{text}
		</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
