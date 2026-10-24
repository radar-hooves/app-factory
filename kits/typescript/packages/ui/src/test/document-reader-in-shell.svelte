<script lang="ts">
	// Fixture for document-reader.test.ts: a reader on a reading page inside the shell.
	import AppShell from '$lib/components/ui/app-shell/app-shell.svelte';
	import DocumentReader from '$lib/components/ui/document-reader/document-reader.svelte';

	let { html }: { html: string } = $props();
</script>

<AppShell nav={[{ label: 'Overview', href: '/overview' }]} currentPath="/overview" brandTitle="Harness">
	<DocumentReader title="The guide" {html} />
</AppShell>
