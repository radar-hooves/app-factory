<!--
	Who shares the active workspace's data, and — for an owner — the acts that
	change it: invite someone, retract a membership or an invitation, rename the
	workspace. Any member may leave. Beside the list, the invitations waiting on
	the caller, to accept or decline.

	This is the screen the tenancy design recorded as not existing. Without it
	the only way to make the grant the whole primitive exists for was an API
	call carrying a UUID read off the database, which is not something the
	operator can do alone (master-project#291). Modelled on the members page
	comparable products keep under organisation settings (GitHub's People,
	Linear's Members): a list with a role beside each person, an add control
	that picks from people the app already knows, a remove per row, confirmed.

	Nothing here decides authorisation. The backend refuses a non-owner's invitation,
	a re-invitation, a removal or departure of the last owner, an acceptance by
	anyone but the invitee and a stranger's read; this surface only hides what the
	caller's role says cannot succeed.
-->
<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import Users from '@lucide/svelte/icons/users';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '@poodle64/ui/alert-dialog';
	import { AppDialog } from '@poodle64/ui/app-dialog';
	import { Badge } from '@poodle64/ui/badge';
	import { Button } from '@poodle64/ui/button';
	import { EmptyState } from '@poodle64/ui/empty-state';
	import { ErrorState } from '@poodle64/ui/error-state';
	import { Input } from '@poodle64/ui/input';
	import { Label } from '@poodle64/ui/label';
	import { LoadingState } from '@poodle64/ui/loading-state';
	import { Panel } from '@poodle64/ui/panel';
	import * as Select from '@poodle64/ui/select';
	import * as Table from '@poodle64/ui/table';
	import { api, describeApiError, toastApiError } from '#lib/api/index.js';
	import { auth } from '#lib/auth.svelte.js';

	let { label = 'Workspace' }: { label?: string } = $props();
	const noun = $derived(label.toLowerCase());

	type Person = { id: string; username: string; display_name: string | null };
	type Member = { user: Person; role: 'owner' | 'member'; status: 'pending' | 'accepted' };
	type Invitation = { workspace: { id: string; name: string }; role: 'owner' | 'member' };

	let members = $state<Member[]>([]);
	let invitations = $state<Invitation[]>([]);
	let people = $state<Person[]>([]);
	let loading = $state(true);
	let failure = $state<string | null>(null);

	const workspace = $derived(auth.activeWorkspace);
	const isOwner = $derived(auth.activeRole === 'owner');
	// Who can still be invited: everyone the app has seen who is not already here or invited.
	const candidates = $derived(people.filter((p) => !members.some((m) => m.user.id === p.id)));

	const acceptedCount = $derived(members.filter((m) => m.status === 'accepted').length);

	const displayName = (p: Person) => p.display_name || p.username;

	async function load() {
		if (!workspace) return;
		loading = true;
		failure = null;
		const [listed, known, waiting] = await Promise.all([
			api.GET('/api/workspaces/{workspace_id}/members', {
				params: { path: { workspace_id: workspace.id } }
			}),
			api.GET('/api/users/'),
			api.GET('/api/workspaces/invitations')
		]);
		loading = false;
		if (listed.error) {
			failure = describeApiError(listed.error, 'Could not load members');
			return;
		}
		members = listed.data;
		people = known.data ?? [];
		invitations = waiting.data ?? [];
	}

	onMount(load);

	// ── Invite ──────────────────────────────────────────────────────────────
	let addOpen = $state(false);
	let chosenUserId = $state('');
	let chosenRole = $state('member');
	let adding = $state(false);
	const chosenPerson = $derived(candidates.find((p) => p.id === chosenUserId));

	// Reset on OPEN, not on success: a cancelled dialog otherwise reopens with
	// the last person and role still chosen, and "owner" left over from an
	// abandoned attempt is a privilege nobody decided to grant.
	function openAdd() {
		chosenUserId = '';
		chosenRole = 'member';
		addOpen = true;
	}

	async function addMember(event: SubmitEvent) {
		event.preventDefault();
		if (!workspace || !chosenUserId) return;
		adding = true;
		const { error } = await api.POST('/api/workspaces/{workspace_id}/members', {
			params: { path: { workspace_id: workspace.id } },
			body: { user_id: chosenUserId, role: chosenRole as Member['role'] }
		});
		adding = false;
		if (error) {
			toastApiError(error, 'Could not send the invitation');
			return;
		}
		toast.success('Invitation sent', {
			description: `${chosenPerson ? displayName(chosenPerson) : 'They'} can see ${workspace.name} once they accept.`
		});
		addOpen = false;
		await load();
	}

	// ── Retract ────────────────────────────────────────────────────────────
	let removing = $state<Member | null>(null);

	async function removeMember() {
		if (!workspace || !removing) return;
		const target = removing;
		removing = null;
		const { error } = await api.DELETE('/api/workspaces/{workspace_id}/members/{user_id}', {
			params: { path: { workspace_id: workspace.id, user_id: target.user.id } }
		});
		if (error) {
			toastApiError(error, 'Could not remove the member');
			return;
		}
		toast.success('Member removed', {
			description: `${displayName(target.user)} no longer sees ${workspace.name}. What they added stays.`
		});
		await load();
	}

	// ── Answer an invitation, or leave ─────────────────────────────────────
	let leaving = $state(false);

	async function answer(invitation: Invitation, accept: boolean) {
		const params = { params: { path: { workspace_id: invitation.workspace.id } } };
		const { error } = accept
			? await api.POST('/api/workspaces/{workspace_id}/invitation/accept', params)
			: await api.POST('/api/workspaces/{workspace_id}/invitation/decline', params);
		if (error) {
			toastApiError(error, accept ? 'Could not accept the invitation' : 'Could not decline it');
			return;
		}
		await auth.refreshWorkspaces();
		await load();
		toast.success(accept ? 'Invitation accepted' : 'Invitation declined', {
			description: accept ? `${invitation.workspace.name} is now in your menu.` : undefined
		});
	}

	async function leave() {
		if (!workspace) return;
		const left = workspace;
		const { error } = await api.POST('/api/workspaces/{workspace_id}/leave', {
			params: { path: { workspace_id: left.id } }
		});
		leaving = false;
		if (error) {
			toastApiError(error, `Could not leave the ${noun}`);
			return;
		}
		await auth.refreshWorkspaces();
		toast.success(`Left ${left.name}`);
	}

	// ── Rename ─────────────────────────────────────────────────────────────
	let renameOpen = $state(false);
	let newName = $state('');
	let renaming = $state(false);

	function openRename() {
		newName = workspace?.name ?? '';
		renameOpen = true;
	}

	async function rename(event: SubmitEvent) {
		event.preventDefault();
		const name = newName.trim();
		if (!workspace || !name) return;
		renaming = true;
		const { error } = await api.PATCH('/api/workspaces/{workspace_id}', {
			params: { path: { workspace_id: workspace.id } },
			body: { name }
		});
		renaming = false;
		if (error) {
			toastApiError(error, `Could not rename the ${noun}`);
			return;
		}
		renameOpen = false;
		await auth.refreshWorkspaces();
		toast.success(`${label} renamed`, { description: `It is now called ${name}.` });
	}
</script>

{#if !workspace}
	<EmptyState title="No {noun} chosen" description="Pick one from the menu in the top bar." />
{:else if loading}
	<LoadingState message="Loading members…" />
{:else if failure}
	<ErrorState message={failure}>
		{#snippet action()}
			<Button variant="outline" onclick={load}>Try again</Button>
		{/snippet}
	</ErrorState>
{:else}
	{#if invitations.length > 0}
		<Panel title="Invitations" subtitle="Nothing is shared with you until you accept." pad={false}>
			<Table.Root>
				<Table.Body>
					{#each invitations as invitation (invitation.workspace.id)}
						<Table.Row data-testid="workspace-invitation">
							<Table.Cell>
								<div class="font-medium">{invitation.workspace.name}</div>
								<div class="text-muted-foreground text-xs">as {invitation.role}</div>
							</Table.Cell>
							<Table.Cell class="space-x-2 text-right">
								<Button
									variant="ghost"
									size="sm"
									onclick={() => answer(invitation, false)}
									data-testid="workspace-invitation-decline"
								>
									Decline
								</Button>
								<Button
									size="sm"
									onclick={() => answer(invitation, true)}
									data-testid="workspace-invitation-accept"
								>
									Accept
								</Button>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Panel>
	{/if}
	<Panel
		title={workspace.name}
		subtitle="{acceptedCount} {acceptedCount === 1 ? 'member' : 'members'}"
		icon={Users}
		pad={false}
		data-testid="workspace-members"
	>
		{#snippet action()}
			{#if isOwner}
				<!-- Icon-only below sm: at 360px the two labelled buttons overran the
				     panel's title. The name stays in the accessible name and the
				     tooltip, so nothing is lost but the pixels. -->
				<Button
					variant="ghost"
					size="sm"
					onclick={openRename}
					aria-label="Rename"
					title="Rename"
					data-testid="workspace-rename"
				>
					<Pencil /><span class="hidden sm:inline">Rename</span>
				</Button>
				<Button
					size="sm"
					onclick={openAdd}
					aria-label="Add member"
					title="Add member"
					data-testid="workspace-add-member"
				>
					<UserPlus /><span class="hidden sm:inline">Add member</span>
				</Button>
			{/if}
		{/snippet}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Person</Table.Head>
					<Table.Head>Role</Table.Head>
					<Table.Head><span class="sr-only">Actions</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each members as member (member.user.id)}
					<Table.Row data-testid="workspace-member-row">
						<Table.Cell>
							<div class="font-medium">{displayName(member.user)}</div>
							{#if member.user.display_name}
								<div class="text-muted-foreground text-xs">{member.user.username}</div>
							{/if}
						</Table.Cell>
						<Table.Cell>
							<Badge variant={member.role === 'owner' ? 'default' : 'outline'}>{member.role}</Badge>
							{#if member.status === 'pending'}
								<Badge variant="secondary" data-testid="workspace-member-pending">invited</Badge>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right">
							<!-- Your own row offers Leave (any role; the backend keeps the last
							     owner and your last workspace); another's offers Remove, to an
							     owner, which on an invited row withdraws the invitation. -->
							{#if member.user.id === auth.user?.id}
								<Button
									variant="ghost"
									size="sm"
									onclick={() => (leaving = true)}
									data-testid="workspace-leave"
								>
									Leave
								</Button>
							{:else if isOwner}
								<Button
									variant="ghost"
									size="sm"
									onclick={() => (removing = member)}
									data-testid="workspace-remove-member"
								>
									{member.status === 'pending' ? 'Withdraw' : 'Remove'}
								</Button>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Panel>
{/if}

<AppDialog
	bind:open={addOpen}
	title="Invite a member"
	subtitle="They see everything in {workspace?.name} once they accept."
	size="sm"
>
	<form id="add-member" class="space-y-4" onsubmit={addMember}>
		<div class="space-y-2">
			<Label for="add-member-person">Person</Label>
			<Select.Root type="single" bind:value={chosenUserId}>
				<Select.Trigger id="add-member-person" class="w-full" data-testid="workspace-add-person">
					{chosenPerson ? displayName(chosenPerson) : 'Choose someone'}
				</Select.Trigger>
				<Select.Content>
					{#each candidates as person (person.id)}
						<Select.Item value={person.id} label={displayName(person)} />
					{/each}
				</Select.Content>
			</Select.Root>
			<p class="text-muted-foreground text-xs">
				Only someone who has signed in to this app at least once can be invited.
			</p>
		</div>
		<div class="space-y-2">
			<Label for="add-member-role">Role</Label>
			<Select.Root type="single" bind:value={chosenRole}>
				<Select.Trigger id="add-member-role" class="w-full" data-testid="workspace-add-role">
					{chosenRole}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="member" label="member" />
					<Select.Item value="owner" label="owner" />
				</Select.Content>
			</Select.Root>
			<p class="text-muted-foreground text-xs">
				An owner may invite and remove members and rename the {noun}; that is all the role decides.
			</p>
		</div>
	</form>
	{#snippet footer()}
		<Button variant="outline" onclick={() => (addOpen = false)}>Cancel</Button>
		<Button
			type="submit"
			form="add-member"
			disabled={adding || !chosenUserId}
			data-testid="workspace-add-submit"
		>
			Invite
		</Button>
	{/snippet}
</AppDialog>

<AppDialog bind:open={renameOpen} title="Rename {noun}" size="xs">
	<form id="rename-workspace" class="space-y-2" onsubmit={rename}>
		<Label for="rename-workspace-name">Name</Label>
		<Input
			id="rename-workspace-name"
			bind:value={newName}
			required
			data-testid="workspace-rename-name"
		/>
	</form>
	{#snippet footer()}
		<Button variant="outline" onclick={() => (renameOpen = false)}>Cancel</Button>
		<Button
			type="submit"
			form="rename-workspace"
			disabled={renaming || !newName.trim()}
			data-testid="workspace-rename-submit"
		>
			Rename
		</Button>
	{/snippet}
</AppDialog>

<AlertDialog.Root bind:open={leaving}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Leave {workspace?.name}?</AlertDialog.Title>
			<AlertDialog.Description>
				You will no longer see it. What you added stays, still attributed to you, and an owner can
				invite you back.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				onclick={leave}
				data-testid="workspace-leave-confirm"
			>
				Leave
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) removing = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{removing?.status === 'pending' ? 'Withdraw the invitation to' : 'Remove'}
				{removing ? displayName(removing.user) : ''}?
			</AlertDialog.Title>
			<AlertDialog.Description>
				{#if removing?.status === 'pending'}
					They will not be able to accept it.
				{:else}
					They will no longer see {workspace?.name}. What they added stays, still attributed to
					them.
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				onclick={removeMember}
				data-testid="workspace-remove-confirm"
			>
				Remove
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
