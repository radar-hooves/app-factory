<!--
	The workspace menu: where the caller is acting, and the ways out of it.

	One control in the shell's `context` slot, whatever the caller holds. With
	one membership it is that workspace's name over Members / New workspace /
	Sign out; with several it also carries the switch, as a radio group of the
	caller's memberships. It never disappears for an org-of-one, because the
	org-of-one is exactly who has to reach Members to make the FIRST grant — a
	switcher rendered only once a second membership existed would have no route
	to the act that creates one (master-project#291).

	Modelled on the workspace menu comparable products put top-left (Linear,
	Slack): the name is the trigger, the other workspaces are radio items, the
	administrative entries sit beneath. Switching selects on the auth store and
	nothing else — the layout keys its page on the active workspace, so the page
	remounts and refetches, and no page has to know a switch happened.

	`label` is what THIS app calls a workspace in its UI — "Household", "Circle"
	(`rules-library/platform/tenancy.md` lets the vocabulary vary while the code
	noun does not). `membersHref` is the app's own route for the members
	surface; the factory stamps one at /workspace.
-->
<script lang="ts">
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Plus from '@lucide/svelte/icons/plus';
	import Users from '@lucide/svelte/icons/users';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { AppDialog } from '@poodle64/ui/app-dialog';
	import { Button, buttonVariants } from '@poodle64/ui/button';
	import * as DropdownMenu from '@poodle64/ui/dropdown-menu';
	import { Input } from '@poodle64/ui/input';
	import { Label } from '@poodle64/ui/label';
	import { api, extractApiError } from '$lib/api';
	import { auth } from '$lib/auth.svelte';

	let {
		label = 'Workspace',
		membersHref = '/workspace'
	}: { label?: string; membersHref?: string } = $props();

	const noun = $derived(label.toLowerCase());
	// bits-ui radio groups carry string values; workspace ids are numbers.
	const activeValue = $derived(auth.activeWorkspace ? String(auth.activeWorkspace.id) : '');

	let createOpen = $state(false);
	let newName = $state('');
	let creating = $state(false);

	async function createWorkspace(event: SubmitEvent) {
		event.preventDefault();
		const name = newName.trim();
		if (!name) return;
		creating = true;
		const { data, error } = await api.POST('/api/workspaces/', { body: { name } });
		creating = false;
		if (error) {
			const info = extractApiError(error, `Could not create the ${noun}`);
			toast.error(info.title, { description: info.description });
			return;
		}
		createOpen = false;
		newName = '';
		await auth.refreshWorkspaces();
		auth.setActiveWorkspace(data.workspace.id);
		toast.success(`${label} created`, {
			description: `You are now working in ${data.workspace.name}.`
		});
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={buttonVariants({ variant: 'outline', size: 'sm' })}
		aria-label="{label} menu"
		data-testid="workspace-menu"
	>
		<span class="max-w-48 truncate" data-testid="workspace-menu-name">
			{auth.activeWorkspace?.name ?? `Choose a ${noun}`}
		</span>
		<ChevronsUpDown class="text-muted-foreground" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start">
		{#if auth.canSwitchWorkspace}
			<DropdownMenu.Label>Switch {noun}</DropdownMenu.Label>
			<DropdownMenu.RadioGroup
				value={activeValue}
				onValueChange={(value) => auth.setActiveWorkspace(Number(value))}
			>
				{#each auth.workspaces as membership (membership.workspace.id)}
					<DropdownMenu.RadioItem
						value={String(membership.workspace.id)}
						data-testid="workspace-menu-option"
					>
						{membership.workspace.name}
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
			<DropdownMenu.Separator />
		{/if}
		<DropdownMenu.Item onSelect={() => goto(membersHref)} data-testid="workspace-menu-members">
			<Users /> Members
		</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => (createOpen = true)} data-testid="workspace-menu-create">
			<Plus /> New {noun}…
		</DropdownMenu.Item>
		<DropdownMenu.Separator />
		<DropdownMenu.Item onSelect={() => void auth.logout()} data-testid="workspace-menu-logout">
			<LogOut /> Sign out
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<AppDialog
	bind:open={createOpen}
	title="New {noun}"
	subtitle="You will be its owner, and its only member until you add someone."
	size="xs"
>
	<form id="create-workspace" class="space-y-2" onsubmit={createWorkspace}>
		<Label for="create-workspace-name">Name</Label>
		<Input
			id="create-workspace-name"
			bind:value={newName}
			placeholder="Household"
			required
			data-testid="workspace-create-name"
		/>
	</form>
	{#snippet footer()}
		<Button variant="outline" onclick={() => (createOpen = false)}>Cancel</Button>
		<Button
			type="submit"
			form="create-workspace"
			disabled={creating || !newName.trim()}
			data-testid="workspace-create-submit"
		>
			Create
		</Button>
	{/snippet}
</AppDialog>
