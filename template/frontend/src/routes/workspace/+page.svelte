<script lang="ts">
	import PageHeader from '@poodle64/ui/page-header';
	import WorkspaceMembers from '$lib/workspaces/workspace-members.svelte';
</script>

<!-- The members surface is the factory's (src/lib/workspaces/); this route is
     where THIS app mounts it, and — with the menu in +layout.svelte — the place
     to say what the app calls a workspace: pass label="Household" to both. -->
<PageHeader title="Members" subtitle="Who shares this workspace's data, and who may change that." />
<WorkspaceMembers />
