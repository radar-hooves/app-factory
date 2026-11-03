<script lang="ts">
	import { usePageTitle } from '#lib/page-title.svelte.js';

	let { name }: { name: string } = $props();
	usePageTitle(() => name);
</script>
