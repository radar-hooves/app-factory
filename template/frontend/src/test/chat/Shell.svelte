<!--
	The persona page inside the shared shell (self-test only), as the panel page
	its route declares: the shell draws its pane, and the bar action that opens
	it as a sheet.
-->
<script lang="ts">
	import { AppShell } from '@poodle64/ui/app-shell';
	import ChatPage from '../../routes/(protected)/chat/[persona]/+page.svelte';
</script>

<AppShell brandTitle="Self-test" currentPath="/chat/outrider" pageType="panel">
	<ChatPage />
</AppShell>
