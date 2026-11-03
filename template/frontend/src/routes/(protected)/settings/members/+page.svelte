<script lang="ts">
	import { shell } from '#lib/shell.js';
	import WorkspaceMembers from '#lib/workspaces/workspace-members.svelte';
</script>

<!-- The members surface is the factory's (src/lib/workspaces/); this route is
     where every app mounts it, under the name its frame declares, inside the
     settings layout. The rail's last crumb names the page (+page.ts). -->
<WorkspaceMembers label={shell.workspaceLabel} />
