<script lang="ts">
	// Harness for the bar's location row: the derived label, the page's
	// registered controls and actions, the rail's foot, and the rail's resize handle.
	import AppShell from '$lib/components/ui/app-shell/app-shell.svelte';
	import ShellControls from '$lib/components/ui/app-shell/shell-controls.svelte';
	import ShellActions from '$lib/components/ui/app-shell/shell-actions.svelte';
	import Download from '@lucide/svelte/icons/download';
	import { Segmented } from '$lib/components/ui/segmented/index.js';
	import type { NavSource } from '$lib/components/ui/app-shell/types.js';

	let {
		currentPath = $bindable('/overview'),
		withControls = $bindable(false),
		withActions = $bindable(false),
		collapsed = $bindable(false)
	}: {
		currentPath?: string;
		withControls?: boolean;
		withActions?: boolean;
		collapsed?: boolean;
	} = $props();

	const nav: NavSource = [
		{ label: 'Overview', href: '/overview' },
		{
			label: 'Securities',
			href: '/securities',
			children: [
				{ label: 'Overview', href: '/securities', exact: true },
				{ label: 'Investing', href: '/securities/investing' },
				{ label: 'Trading', href: '/securities/trading' }
			]
		}
	];

	let year = $state('FY26');
	const years = [
		{ value: 'FY25', label: 'FY25' },
		{ value: 'FY26', label: 'FY26' }
	];
</script>

<div data-testid="probe-year">{year}</div>

<AppShell {nav} {currentPath} bind:collapsed brandTitle="Harness">
	{#if withActions}
		<ShellActions
			status="Draft 0.1"
			actions={[
				{ label: 'Brand guide', icon: Download, href: '/guide.pdf', download: true, primary: true },
				{ label: 'Export', icon: Download, onclick: () => (year = 'EXPORTED') }
			]}
		/>
	{/if}
	{#if withControls}
		<ShellControls>
			<Segmented bind:value={year} options={years} label="Financial year" size="sm" />
		</ShellControls>
	{/if}
	<p>Page body</p>
</AppShell>
