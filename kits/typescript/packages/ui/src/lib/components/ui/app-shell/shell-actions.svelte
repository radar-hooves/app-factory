<script lang="ts">
	/**
	 * Registers this page's status and actions in the shell's top bar. Renders
	 * nothing where it stands.
	 *
	 *     <ShellActions status="Draft 0.1" actions={[{ label: 'Brand guide', icon: Download, href, download: true, primary: true }]} />
	 *
	 * Wide, each action is a labelled button beside the bar's own icons. On a
	 * phone the status stands down and the actions fold into one "More actions"
	 * menu, so the title keeps the row. One registration at a time; a later one
	 * replaces an earlier one.
	 */
	import { getShellActions, type BarAction } from './controls.js';

	let { status, actions = [] }: { status?: string; actions?: readonly BarAction[] } = $props();

	const holder = getShellActions();

	$effect(() => {
		if (!holder) return;
		const registration = { status, actions };
		if (!status && actions.length === 0) return;
		holder.current = registration;
		return () => {
			if (holder.current === registration) holder.current = null;
		};
	});
</script>
