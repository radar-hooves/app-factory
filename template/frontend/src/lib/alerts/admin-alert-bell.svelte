<!--
	What machines told this deployment's operator (app-factory docs/design/alerts.md), for
	whoever holds admin: the server gates the routes, and this only spares
	everyone else a bell whose every call would 403. Renders nothing while no
	alert is open and nothing for a caller without admin.

	The factory's frame (#lib/app-frame.svelte) mounts this in AppShell's `actions`
	snippet, the alerts' place in the bar. The gate stays one factory fix, not a
	per-app copy that goes stale as it evolves.
-->
<script lang="ts">
	import { AlertBell } from '@poodle64/ui/alerts';
	import { apiFetch } from '#lib/api/index.js';
	import { auth } from '#lib/auth.svelte.js';
</script>

{#if auth.can('admin')}
	<AlertBell fetch={apiFetch} />
{/if}
