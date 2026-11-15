<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { startUpdateChecks } from '@poodle64/ui/updater';

	let { children } = $props();

	onMount(startUpdateChecks);
</script>

<ModeWatcher />
<Toaster />
{@render children()}
