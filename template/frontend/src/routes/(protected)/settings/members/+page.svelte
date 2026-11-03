<script lang="ts">
	import PageHeader from '@poodle64/ui/page-header';
	import { shell } from '#lib/shell.js';
	import WorkspaceMembers from '#lib/workspaces/workspace-members.svelte';

	const noun = shell.workspaceLabel.toLowerCase();
</script>

<!-- The members surface is the factory's (src/lib/workspaces/); this route is
     where every app mounts it, under the name its frame declares, inside the
     settings layout: the same panel frame and header as every other setting. -->
<PageHeader title="Members" subtitle="Who shares this {noun}'s data." />
<WorkspaceMembers label={shell.workspaceLabel} />
