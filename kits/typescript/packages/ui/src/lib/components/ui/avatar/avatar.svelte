<script lang="ts">
	import { Avatar as AvatarPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	/**
	 * The signed-in user's face, with a fallback that survives a broken image.
	 *
	 * It ships here because AppShell's own `identity` snippet needs it: the shell
	 * defines the slot, so a consumer filling that slot should not have to keep a
	 * private copy of a primitive to do it. In the app that reported this, the
	 * avatar was the sole survivor of a hundred-file vendored folder — kept
	 * verbatim, with a comment explaining it was a package gap — which is a copy
	 * that can never receive an upstream fix.
	 *
	 * Root, Image and Fallback only. The group and badge variants in the upstream
	 * registry had no consumer in any surveyed app, and an unused component is a
	 * surface to keep correct for nobody.
	 */
	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: AvatarPrimitive.RootProps = $props();
</script>

<AvatarPrimitive.Root
	bind:ref
	data-slot="avatar"
	class={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
	{...restProps}
/>
