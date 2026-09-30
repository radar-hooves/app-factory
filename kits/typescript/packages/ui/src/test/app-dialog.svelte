<script lang="ts">
	// Fixture for app-dialog.test.ts: the frame under a single prop, so the width
	// scale can be driven one size at a time.
	import AppDialog from '$lib/components/ui/app-dialog/app-dialog.svelte';

	let { size }: { size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' } = $props();
	let open = $state(true);
</script>

<AppDialog bind:open title="Sized dialogue" {size}>
	<p>Body</p>
</AppDialog>
