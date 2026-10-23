<script lang="ts">
	// Harness for feedback's one home: the layout mounts ReportWidget beside the
	// shell, as the template does, and the shell draws its trigger. `actions` and
	// `identity` stand in for an app's own bar items, to prove the order.
	import AppShell from '$lib/components/ui/app-shell/app-shell.svelte';
	import ReportWidget from '$lib/components/feedback/report-widget.svelte';

	let {
		mounted = true,
		...widget
	}: { mounted?: boolean; endpoint?: string; team?: string; onSubmitted?: (id: string) => void; fetch?: typeof fetch } =
		$props();
</script>

<AppShell nav={[{ label: 'Overview', href: '/overview' }]} currentPath="/overview" brandTitle="Harness">
	{#snippet actions()}<button type="button" data-testid="probe-action">Chip in</button>{/snippet}
	{#snippet identity()}<button type="button" data-testid="probe-identity">Account</button>{/snippet}
	<p>Page body</p>
</AppShell>
{#if mounted}<ReportWidget {...widget} />{/if}
