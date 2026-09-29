<!--
	The settings page is the app-slices kit's, mounted here: every Setting a
	domain declares renders on it with no code in this app (docs/design/settings.md).
	A 401 goes to this app's own re-authentication, as its API client's does.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { SettingsPage } from '@poodle64/ui/settings';
	import { redirectToAuthentik } from '$api';
</script>

<SettingsPage onunauthorized={() => redirectToAuthentik(page.url.pathname + page.url.search)} />
