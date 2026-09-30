<script lang="ts">
	import '../app.css';
	import '@fontsource-variable/fraunces';
	import '@fontsource-variable/hanken-grotesk';
	import '@fontsource-variable/jetbrains-mono';
	import { ModeWatcher } from 'mode-watcher';

	let { children } = $props();
</script>

<!--
	Bare on purpose. Each route decides its own chrome, because the two kinds of
	route here want opposite things: the console's own pages compose the real
	AppShell (which is the dogfooding), and /lab must own the whole viewport to
	render a shell shape the package cannot produce yet. A shared shell here
	would nest two of them.
-->
<ModeWatcher />
{@render children()}
