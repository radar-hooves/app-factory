<script lang="ts">
	/**
	 * A record's picture at a fixed size: its photo, or a quiet tile with the
	 * module's icon when it has none or the photo fails to load. Decorative:
	 * the record's name always sits beside it.
	 */
	import type { IconComponent } from '../app-shell/types.js';
	import { cn } from '$lib/utils.js';

	let {
		src,
		icon: Icon,
		class: className
	}: { src?: string | null; icon?: IconComponent; class?: string } = $props();

	let failed = $state<string | null>(null);
</script>

<span
	class={cn(
		'bg-surface-2 border-border/60 grid flex-none place-items-center overflow-hidden rounded-md border',
		className
	)}
	aria-hidden="true"
	data-slot="record-thumbnail"
>
	{#if src && failed !== src}
		<img {src} alt="" loading="lazy" class="size-full object-cover" onerror={() => (failed = src)} />
	{:else if Icon}
		<Icon class="text-primary size-1/2" />
	{/if}
</span>
