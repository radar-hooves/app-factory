<!--
	Who shares the active workspace's data, and — for an owner — the acts that
	change it: grant a membership, retract one, rename the workspace.

	This is the screen the tenancy design recorded as not existing. Without it
	the only way to make the grant the whole primitive exists for was an API
	call carrying a UUID read off the database, which is not something the
	operator can do alone (master-project#291). Modelled on the members page
	comparable products keep under organisation settings (GitHub's People,
	Linear's Members): a list with a role beside each person, an add control
	that picks from people the app already knows, a remove per row, confirmed.

	Nothing here decides authorisation. The backend refuses a non-owner's grant,
	a re-grant, a removal of the last owner and a stranger's read; this surface
	only hides what the caller's role says cannot succeed.
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
	import { api, describeApiError, toastApiError } from '$lib/api';
	import { auth } from '$lib/auth.svelte';

	let { label = 'Workspace' }: { label?: string } = $props();
	const noun = $derived(label.toLowerCase());

	type Person = { id: string; username: string; display_name: string | null };
	type Member = { user: Person; role: 'owner' | 'member' };

	let members = $state<Member[]>([]);
	let people = $state<Person[]>([]);
	let loading = $state(true);
	let failure = $state<string | null>(null);

	const workspace = $derived(auth.activeWorkspace);
	const isOwner = $derived(auth.activeRole === 'owner');
	// Who can still be added: everyone the app has seen who is not already here.
	const candidates = $derived(people.filter((p) => !members.some((m) => m.user.id === p.id)));

	const displayName = (p: Person) => p.display_name || p.username;

	async function load() {
		if (!workspace) return;
		loading = true;
		failure = null;
		const [listed, known] = await Promise.all([
			api.GET('/api/workspaces/{workspace_id}/members', {
				params: { path: { workspace_id: workspace.id } }
			}),
			api.GET('/api/users/')
		]);
		loading = false;
		if (listed.error) {
			failure = describeApiError(listed.error, 'Could not load members');
			return;
		}
		members = listed.data;
		people = known.data ?? [];
	}

	onMount(load);

	// ── Grant ──────────────────────────────────────────────────────────────
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
			toastApiError(error, 'Could not add the member');
			return;
		}
		toast.success('Member added', {
			description: `${chosenPerson ? displayName(chosenPerson) : 'They'} can now see everything in ${workspace.name}.`
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
	<Panel
		title={workspace.name}
		subtitle="{members.length} {members.length === 1 ? 'member' : 'members'}"
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
					{#if isOwner}
						<Table.Head><span class="sr-only">Actions</span></Table.Head>
					{/if}
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
						</Table.Cell>
						{#if isOwner}
							<Table.Cell class="text-right">
								<!-- Never your own row. Leaving is a different act from being
								     removed — a member is not an owner, so it would need its own
								     route — and nobody has asked for it; the backend's last-owner
								     refusal covers the one lockout, so the control is not offered. -->
								{#if member.user.id !== auth.user?.id}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => (removing = member)}
										data-testid="workspace-remove-member"
									>
										Remove
									</Button>
								{/if}
							</Table.Cell>
						{/if}
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</Panel>
{/if}

<AppDialog
	bind:open={addOpen}
	title="Add a member"
	subtitle="They will see everything in {workspace?.name} from their next request."
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
				Only someone who has signed in to this app at least once can be added.
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
				An owner may add and remove members and rename the {noun}; that is all the role decides.
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
			Add
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

<AlertDialog.Root
	open={removing !== null}
	onOpenChange={(open) => {
		if (!open) removing = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Remove {removing ? displayName(removing.user) : ''}?</AlertDialog.Title>
			<AlertDialog.Description>
				They will no longer see {workspace?.name}. What they added stays, still attributed to them.
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
