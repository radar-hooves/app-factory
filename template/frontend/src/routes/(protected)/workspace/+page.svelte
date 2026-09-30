<script lang="ts">
	import PageHeader from '@poodle64/ui/page-header';
	import { workspaceLabel } from '$lib/app-frame.svelte';
	import WorkspaceMembers from '$lib/workspaces/workspace-members.svelte';

	const noun = workspaceLabel.toLowerCase();
</script>

<!-- The members surface is the factory's (src/lib/workspaces/); this route is
     where every app mounts it, under the name its frame declares. -->
<PageHeader title="Members" subtitle="Who shares this {noun}'s data." />
<WorkspaceMembers label={workspaceLabel} />
