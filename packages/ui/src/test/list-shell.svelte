<script lang="ts">
	// Harness for the working list, in the shape a consuming module uses it:
	// beside AppShell's `padded={false}` content, `open` bound so the caller's
	// own reopen control (rendered here, right where the mockup puts it — in the
	// page's own header) drives the same state this component owns while open.
	import AppShell from '$lib/components/ui/app-shell/app-shell.svelte';
	import ListShell from '$lib/components/ui/list-shell/list-shell.svelte';

	let { open = $bindable(true) }: { open?: boolean } = $props();
</script>

<AppShell
	nav={[{ label: 'Overview', href: '/overview' }]}
	currentPath="/overview"
	brandTitle="Harness"
	padded={false}
	themeToggle={false}
>
	<div class="flex min-h-0 flex-1">
		<ListShell title="Waiting on you" bind:open>
			{#snippet actions()}
				<button type="button" aria-label="Add documents">+</button>
			{/snippet}
			<ul>
				<li>Aldi receipt</li>
				<li>Gas rates change notice</li>
			</ul>
		</ListShell>
		<div class="flex-1">
			{#if !open}
				<button type="button" onclick={() => (open = true)} aria-expanded={open}>
					Waiting on you
				</button>
			{/if}
			<p>The run</p>
		</div>
	</div>
</AppShell>
