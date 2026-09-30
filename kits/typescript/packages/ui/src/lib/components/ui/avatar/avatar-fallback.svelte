<script lang="ts">
	import { Avatar as AvatarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	/**
	 * What shows while the image is loading and after it fails. It is not a
	 * decoration: an avatar whose source 404s is the ordinary case (a deleted
	 * upload, an expired signed URL, an identity provider that serves no picture),
	 * and this is the only thing standing between that and an empty circle.
	 */
	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: AvatarPrimitive.FallbackProps = $props();
</script>

<AvatarPrimitive.Fallback
	bind:ref
	data-slot="avatar-fallback"
	class={cn(
		'bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-xs font-medium',
		className
	)}
	{...restProps}
/>
