<script lang="ts">
	// Fixture for avatar.test.ts. Imported through the barrel, by the names a
	// consumer writes, so the export shape is part of what is under test.
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';

	let { src }: { src?: string } = $props();
</script>

<Avatar>
	{#if src}
		<AvatarImage {src} alt="Operator" />
	{/if}
	<AvatarFallback>OP</AvatarFallback>
</Avatar>
