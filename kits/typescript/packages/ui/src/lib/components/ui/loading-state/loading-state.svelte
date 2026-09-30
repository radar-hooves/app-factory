<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import { cn, type WithElementRef } from '$lib/utils.js';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		message?: string;
	};

	let {
		message = 'Loading…',
		ref = $bindable(null),
		class: className,
		...restProps
	}: Props = $props();
</script>

<div
	bind:this={ref}
	class={cn('flex flex-col items-center justify-center p-8', className)}
	role="status"
	aria-live="polite"
	aria-label={message}
	{...restProps}
>
	<Loader2 class="text-muted-foreground mb-2 size-8 animate-spin" aria-hidden="true" />
	<p class="text-muted-foreground text-sm">{message}</p>
</div>
