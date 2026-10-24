<script lang="ts">
	import { Panel } from '@poodle64/ui/panel';
	import { SettingsRow } from '@poodle64/ui/settings-row';
	import { SettingsShell, type SettingsSectionGroup } from '@poodle64/ui/settings-shell';
	import { Switch } from '@poodle64/ui/switch';
	import User from '@lucide/svelte/icons/user';
	import Bell from '@lucide/svelte/icons/bell';
	import Building from '@lucide/svelte/icons/building';
	import Users from '@lucide/svelte/icons/users';

	// A panel page, shaped like an app's settings: the sections are the pane,
	// the section you are on the page. State-driven, as a single-route app's is.
	const sections: SettingsSectionGroup[] = [
		{
			heading: 'Your account',
			items: [
				{ id: 'account', label: 'Account', icon: User },
				{ id: 'alerts', label: 'Alerts', icon: Bell }
			]
		},
		{
			heading: 'This workspace',
			items: [
				{ id: 'workspace', label: 'Workspace', icon: Building },
				{ id: 'members', label: 'Members', icon: Users }
			]
		}
	];
	let selected = $state('account');
	let digest = $state(true);
	let weekly = $state(false);
</script>

<SettingsShell {sections} {selected} onSelect={(id) => (selected = id)}>
	{#if selected === 'account'}
		<Panel title="You" description="From your sign-in; change your name or email there.">
			<dl class="divide-border divide-y text-sm">
				<div class="flex justify-between py-2">
					<dt class="text-muted-foreground">Username</dt>
					<dd>maintainer</dd>
				</div>
				<div class="flex justify-between py-2">
					<dt class="text-muted-foreground">Last seen</dt>
					<dd class="tabular-nums">24/10/2026, 10:08</dd>
				</div>
			</dl>
		</Panel>
		<Panel title="What you can open" description="Granted with your account.">
			<ul class="flex flex-col gap-2 text-sm">
				<li>Ask, across the collections you may read.</li>
				<li>Library, every source document by subject and publisher.</li>
				<li>Intelligence, who is connected to what.</li>
			</ul>
		</Panel>
	{:else}
		<Panel title={selected === 'alerts' ? 'Alerts' : 'Notifications'} pad={false}>
			<SettingsRow label="Daily digest" description="One message a day with what changed." controlId="digest">
				<Switch id="digest" bind:checked={digest} />
			</SettingsRow>
			<SettingsRow label="Weekly summary" description="A longer read on Monday mornings." controlId="weekly">
				<Switch id="weekly" bind:checked={weekly} />
			</SettingsRow>
		</Panel>
	{/if}
</SettingsShell>
