<!--
	The workspace menu: the switch between workspaces, for whoever has more
	than one to switch between.

	One control in the shell's `context` slot. With several memberships it is
	the active one's name over a radio group of the rest, then Members / New
	workspace; with exactly one it renders NOTHING (operator ruling,
	07/09/2026) — a caller with nothing to switch to was shown a chip carrying
	their own workspace's name back at them, which at phone width is the same
	dead-weight-in-the-bar defect as an unnamed AppIdentity handle, and for the
	same reason: a control with one possible state is not a control.

	Members does not disappear with it. The org-of-one is exactly who has to
	reach Members to make the FIRST grant (master-project#291), so the
	layout's own `identity` slot wires `AppIdentity`'s `onManageMembers` for
	exactly the callers this component renders nothing for — see
	`+layout.svelte`. New-workspace creation has no such second door: an
	org-of-one who wants a second workspace reaches it once a second
	membership makes this menu render again, or from a route the app adds if
	that act turns out to matter sooner.

	Sign out is deliberately NOT here. It moved to AppIdentity in the top bar's
	`identity` slot when the package started shipping one — ending a session is
	an act on your IDENTITY, not on the workspace you happen to be acting in,
	and carrying it in both places gave a stamped app two of them.

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
	import Layers from '@lucide/svelte/icons/layers';
	import Plus from '@lucide/svelte/icons/plus';
	import Users from '@lucide/svelte/icons/users';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { AppDialog } from '@poodle64/ui/app-dialog';
	import { Button, buttonVariants } from '@poodle64/ui/button';
	import * as DropdownMenu from '@poodle64/ui/dropdown-menu';
	import { Input } from '@poodle64/ui/input';
	import { Label } from '@poodle64/ui/label';
	import { api, toastApiError } from '$lib/api';
	import { auth } from '$lib/auth.svelte';
	import { cn } from '$lib/utils';

	let {
		label = 'Workspace',
		membersHref = '/workspace'
	}: { label?: string; membersHref?: string } = $props();

	const noun = $derived(label.toLowerCase());
	// The only reason this ever renders: something to switch between.
	const hasChoice = $derived(auth.canSwitchWorkspace);
	// bits-ui radio groups carry string values; workspace ids are numbers.
	const activeValue = $derived(auth.activeWorkspace ? String(auth.activeWorkspace.id) : '');

	let createOpen = $state(false);
	let newName = $state('');
	let creating = $state(false);

	// Reset on open: a name typed and then cancelled must not reappear.
	function openCreate() {
		newName = '';
		createOpen = true;
	}

	async function createWorkspace(event: SubmitEvent) {
		event.preventDefault();
		const name = newName.trim();
		if (!name) return;
		creating = true;
		const { data, error } = await api.POST('/api/workspaces/', { body: { name } });
		creating = false;
		if (error) {
			toastApiError(error, `Could not create the ${noun}`);
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

{#if hasChoice}
	<DropdownMenu.Root>
		<!-- `aria-label` carries the accessible name below `sm`, where the name
		     span is visually hidden to keep this chip from crowding search, the
		     theme toggle and identity into a phone-width bar — the visible text
		     still IS the accessible name at `sm` and up (WCAG 2.5.3). -->
		<DropdownMenu.Trigger
			class={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5 px-2 sm:px-3')}
			aria-label={auth.activeWorkspace?.name ?? `Choose a ${noun}`}
			data-testid="workspace-menu"
		>
			<Layers class="sm:hidden" />
			<span class="hidden max-w-48 truncate sm:inline" data-testid="workspace-menu-name">
				{auth.activeWorkspace?.name ?? `Choose a ${noun}`}
			</span>
			<ChevronsUpDown class="text-muted-foreground" />
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start">
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
			<DropdownMenu.Item onSelect={() => goto(membersHref)} data-testid="workspace-menu-members">
				<Users /> Members
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={openCreate} data-testid="workspace-menu-create">
				<Plus /> New {noun}…
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}

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
