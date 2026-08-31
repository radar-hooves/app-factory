<script lang="ts">
	// Harness for the page-chrome components. Every interactive affordance is
	// wired to a state flag rendered as a non-visual <output> probe, so a test
	// asserts the callback actually fired rather than that something merely drew.
	import PageHeader from '$lib/components/ui/page-header/page-header.svelte';
	import DetailPanel from '$lib/components/ui/detail-panel/detail-panel.svelte';
	import AppDialog from '$lib/components/ui/app-dialog/app-dialog.svelte';
	import DialogSection from '$lib/components/ui/dialog-section/dialog-section.svelte';
	import ContextColumn from '$lib/components/ui/context-column/context-column.svelte';
	import EmptyState from '$lib/components/ui/empty-state/empty-state.svelte';
	import ErrorState from '$lib/components/ui/error-state/error-state.svelte';
	import LoadingState from '$lib/components/ui/loading-state/loading-state.svelte';
	import InfoTip from '$lib/components/ui/info-tip/info-tip.svelte';
	import StatusBadge from '$lib/components/ui/status-badge/status-badge.svelte';
	import StatCard from '$lib/components/ui/stat-card/stat-card.svelte';
	import StatList from '$lib/components/ui/stat-list/stat-list.svelte';
	import Panel from '$lib/components/ui/panel/panel.svelte';

	let dialogOpen = $state(false);
	// Every open-state change the dialogue reports, in order — including the ones
	// it makes for itself (Escape, the scrim, the close control), which is exactly
	// what bind:open alone cannot give a caller a moment to act on.
	let dialogOpenChanges = $state<boolean[]>([]);
	let panelClosed = $state(false);
	let showDetail = $state(true);
	let emptyActionFired = $state(false);
	let errorActionFired = $state(false);
</script>

<PageHeader
	eyebrow="Section"
	title="Chrome harness"
	subtitle="One line, clamped."
	info="Explains the page."
	id="page-header-root"
	data-testid="page-header-root"
	class="ring-1"
>
	{#snippet actions()}
		<button type="button">Primary action</button>
	{/snippet}
</PageHeader>

<button type="button" onclick={() => (dialogOpen = true)}>Open app dialog</button>
<AppDialog
	bind:open={dialogOpen}
	onOpenChange={(open) => (dialogOpenChanges = [...dialogOpenChanges, open])}
	title="Harness dialog"
	subtitle="A subtitle"
	size="lg"
>
	<DialogSection label="First">
		<p>Section one body</p>
	</DialogSection>
	<DialogSection label="Second">
		<p>Section two body</p>
	</DialogSection>
	{#snippet footer()}
		<button type="button">Confirm</button>
	{/snippet}
</AppDialog>

<ContextColumn
	stats={[
		{ label: 'Active', value: 3, status: 'success' },
		{ label: 'Failed', value: 0, muted: true, status: 'error' }
	]}
	statsInfo="What these count."
	ariaLabel="Record context"
	data-testid="context-column-root"
>
	{#snippet detail()}
		{#if showDetail}
			<DetailPanel
				eyebrow="Record"
				title="record-42"
				status="warning"
				statusLabel="Expiring"
				onClose={() => (panelClosed = true)}
				data-testid="detail-panel-root"
			>
				<p>Detail body</p>
				{#snippet footer()}
					<button type="button">Revoke</button>
				{/snippet}
			</DetailPanel>
		{/if}
	{/snippet}
</ContextColumn>

<button type="button" onclick={() => (showDetail = !showDetail)}>Toggle detail</button>

<!-- Negative branch: a status with no statusLabel must draw no chip, since a
     colour with no label is the WCAG 1.4.1 failure StatusBadge exists to stop. -->
<DetailPanel title="record-99" status="error">
	<p>Unlabelled status body</p>
</DetailPanel>

<!-- titleFace (design-system#9): the class-name half of the claim, paired
     with the resolved-font-family half in harness/drive.mjs. -->
<DetailPanel title="record-default-face" data-testid="detail-panel-face-default">
	<p>Default face body</p>
</DetailPanel>
<DetailPanel title="Jordan Rivers" titleFace="display" data-testid="detail-panel-face-display">
	<p>Display face body</p>
</DetailPanel>

<EmptyState
	title="Nothing yet"
	description="Add the first one."
	data-testid="empty-state-root"
>
	{#snippet action()}
		<button type="button" onclick={() => (emptyActionFired = true)}>Create</button>
	{/snippet}
</EmptyState>

<ErrorState message="Could not load the estate." data-testid="error-state-root">
	{#snippet action()}
		<button type="button" onclick={() => (errorActionFired = true)}>Retry</button>
	{/snippet}
</ErrorState>

<LoadingState message="Fetching records…" data-testid="loading-state-root" />

<InfoTip text="Standalone hint" />
<InfoTip text="Wrapping hint">
	<span data-testid="wrapped-trigger">wrapped</span>
</InfoTip>

<!-- A page header that is a breadcrumb bar: no title at all, which is the shape
     19 of one app's 22 headers take and the reason it could not adopt this
     component. The trail is the app's own routed links, as a snippet. -->
<!-- The icon + meta shape (design-system#21). Three apps had hand-rolled the
     meta row and two the icon square; one reimplemented this whole component
     locally to get them, across 38 of its 49 page headers. -->
<PageHeader title="Ledger entry" subtitle="A short line." data-testid="page-header-icon">
	{#snippet icon()}
		<svg data-testid="header-glyph" viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /></svg>
	{/snippet}
	{#snippet meta()}
		<span data-testid="meta-opened">Opened 12/03/2026</span>
		<span data-testid="meta-status">Active</span>
	{/snippet}
</PageHeader>

<PageHeader data-testid="page-header-trail">
	{#snippet breadcrumbs()}
		<a href="#/estate">Estate</a>
		<span aria-hidden="true">/</span>
		<span data-testid="crumb-current">Records</span>
	{/snippet}
	{#snippet actions()}
		<button type="button">Trail action</button>
	{/snippet}
</PageHeader>

<StatusBadge status="success" label="Healthy" />
<!-- A state that is still moving. `pulse` is the axis that separates "syncing"
     from "synced" without adding a sixth word to a closed vocabulary; `class` is
     placement, which only the call site knows. -->
<StatusBadge status="info" label="Syncing" pulse class="ml-auto self-start" />
<StatCard
	label="Sessions"
	value={12}
	unit="live"
	sub="last hour"
	status="info"
	data-testid="stat-card-root"
/>
<!-- The feed is healthy (status) and the number is a loss (valueTone). Two
     different claims about the same card, which is why they are two props. -->
<StatCard label="Realised" value="-1,204.55" unit="AUD" status="success" valueTone="error" />
<StatList
	title="Totals"
	items={[
		{ label: 'Warm', value: 4, status: 'success' },
		{ label: 'Cold', value: 0, status: 'error', muted: true }
	]}
	data-testid="stat-list-root"
/>
<Panel title="Panel title" subtitle="Panel subtitle" data-testid="panel-root">
	<p>Panel body</p>
</Panel>

<!-- Non-visual outcome probes. -->
<output data-testid="panel-closed">{panelClosed ? 'closed' : 'open'}</output>
<output data-testid="dialog-open-changes">{dialogOpenChanges.join(',') || 'none'}</output>
<output data-testid="empty-action">{emptyActionFired ? 'fired' : 'idle'}</output>
<output data-testid="error-action">{errorActionFired ? 'fired' : 'idle'}</output>
