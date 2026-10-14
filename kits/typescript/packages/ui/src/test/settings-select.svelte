<script lang="ts">
	import SettingsShell from '$lib/components/ui/settings-shell/settings-shell.svelte';
	import Panel from '$lib/components/ui/panel/panel.svelte';
	import SettingsRow from '$lib/components/ui/settings-row/settings-row.svelte';

	let { onpick = () => {} }: { onpick?: (id: string) => void } = $props();
	let selected = $state('library');
</script>

<SettingsShell
	sections={[
		{ heading: 'Music', items: [{ id: 'library', label: 'Library' }, { id: 'audio', label: 'Audio' }] }
	]}
	{selected}
	onSelect={(id) => {
		selected = id;
		onpick(id);
	}}
>
	<Panel title={selected} pad={false}>
		<SettingsRow label="Rescan" description="On start." controlId="rescan">
			<input id="rescan" type="checkbox" />
		</SettingsRow>
		<SettingsRow label="Second"><button type="button">Go</button></SettingsRow>
	</Panel>
</SettingsShell>
