<!--
	The persona page inside the shared shell (self-test only), so the page's own
	bar action (`ShellActions`) has a bar to stand in.
-->
<script lang="ts">
	import { AppShell } from '@poodle64/ui/app-shell';
	import ChatPage from '../../routes/(protected)/chat/[persona]/+page.svelte';
</script>

<AppShell brandTitle="Self-test" currentPath="/chat/outrider">
	<ChatPage />
</AppShell>
