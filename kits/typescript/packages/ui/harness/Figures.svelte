<script lang="ts">
	/**
	 * `?surface=figures`: a page of key figures over a list, drawn with the
	 * shipped PageLead, KeyFigures and RecordList and nothing of its own
	 * (godswood's /admin, 23/11/2026). The data is invented.
	 */
	import AppShell from '../dist/components/ui/app-shell/app-shell.svelte';
	import type { NavSource } from '../dist/components/ui/app-shell/types.js';
	import KeyFigures from '../dist/components/ui/key-figures/key-figures.svelte';
	import PageContainer from '../dist/components/ui/page-container/page-container.svelte';
	import PageLead from '../dist/components/ui/page-lead/page-lead.svelte';
	import RecordList from '../dist/components/ui/record-list/record-list.svelte';
	import type { RecordListColumn, RecordListRow } from '../dist/components/ui/record-list/index.js';
	import Gear from '#lib/icons/gear.svelte';
	import House from '#lib/icons/house.svelte';
	import Users from '#lib/icons/users.svelte';
	import UserPlus from '#lib/icons/user-plus.svelte';

	const nav: NavSource = [
		{ label: 'Home', href: '#/home', icon: House },
		{ label: 'Admin', href: '#/admin', icon: Gear }
	];

	type Member = RecordListRow & { role: string; joined: string };
	const members: Member[] = [
		{ id: 1, title: 'harbour@example.com', note: 'Signed in today', role: 'Owner', joined: '02/07/2024' },
		{ id: 2, title: 'wattle@example.com', note: 'Signed in 19/11/2026', role: 'Member', joined: '14/03/2025' },
		{
			id: 3,
			title: 'banksia@example.com',
			note: 'Never signed in',
			role: 'Member',
			joined: '21/11/2026',
			flags: [{ status: 'warning', label: 'Invitation not taken up' }]
		}
	];
	const columns: RecordListColumn<Member>[] = [
		{ key: 'role', label: 'Role', width: '9rem', text: (r) => r.role },
		{ key: 'joined', label: 'Joined', align: 'end', width: '9rem', sort: (r) => r.id, text: (r) => r.joined }
	];
</script>

{#snippet lead()}<Users />{/snippet}

<AppShell {nav} currentPath="#/admin" brandTitle="Godswood" onSearch={() => {}} texture="grid" pageType="tool">
	<PageContainer>
		<PageLead lead="Three members, one yet to sign in." subtitle="Who uses this workspace, and since when." icon={lead} />
		<KeyFigures
			figures={[
				{ label: 'Members', value: 3, sub: 'in this workspace' },
				{ label: 'Active', value: 2, status: 'success', sub: 'signed in this month' },
				{ label: 'Waiting', value: 1, status: 'warning', sub: 'invited, not signed in' },
				{ label: 'New this month', value: 0, valueTone: 'neutral', sub: 'since 1 Nov' }
			]}
			data-probe="key-figures"
		/>
		<RecordList
			rows={members}
			{columns}
			noun={['member', 'members']}
			title="Members"
			action={{ label: 'Invite a member', icon: UserPlus }}
			onOpen={() => {}}
			data-probe="record-list"
		/>
	</PageContainer>
</AppShell>
