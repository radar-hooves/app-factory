<!--
	What machines told this deployment's operator (docs/design/alerts.md), for
	whoever holds admin: the server gates the routes, and this only spares
	everyone else a bell whose every call would 403. Renders nothing while no
	alert is open and nothing for a caller without admin.

	The factory's own +layout.svelte mounts this in AppShell's `actions` snippet.
	An app that owns its root layout (canonical-app-shape.md §Exceptions) drops
	this one line in wherever its own chrome puts top-bar actions instead of
	reimplementing the admin gate by hand — the gate stays a factory fix, not a
	per-app copy that goes stale as it evolves.
-->
<script lang="ts">
	import { AlertBell } from '@poodle64/ui/alerts';
	import { auth } from '$lib/auth.svelte';
</script>

{#if auth.can('admin')}
	<AlertBell />
{/if}
