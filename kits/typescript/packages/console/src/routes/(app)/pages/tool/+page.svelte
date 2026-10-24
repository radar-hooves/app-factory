<script lang="ts">
	import { ContextColumn } from '@poodle64/ui/context-column';
	import { Input } from '@poodle64/ui/input';
	import { Panel } from '@poodle64/ui/panel';
	import * as Table from '@poodle64/ui/table';
	import type { StatItem } from '@poodle64/ui/stat-list';

	// A tool page, shaped like an app's library: a search above a table that
	// fills the frame and scrolls inside itself, and the page's context beside it.
	const subjects = ['Procurement', 'Programme', 'Audit', 'People', 'Airworthiness'];
	const publishers = ['Department of Defence', 'ANAO', 'Parliament', 'Home Affairs', ''];
	const rows = Array.from({ length: 80 }, (_, i) => ({
		id: i + 1,
		title: `Source document ${i + 1}: ${subjects[i % subjects.length]} review`,
		publisher: publishers[i % publishers.length],
		subject: subjects[(i * 3) % subjects.length],
		year: 2026 - (i % 4)
	}));
	let query = $state('');
	const shown = $derived(
		rows.filter((r) => r.title.toLowerCase().includes(query.trim().toLowerCase()))
	);
	const stats: StatItem[] = $derived([
		{ label: 'Sources', value: rows.length },
		{ label: 'Shown', value: shown.length },
		{ label: 'Subjects', value: subjects.length }
	]);
</script>

<Input type="search" placeholder="Find a document, a publisher, a phrase" bind:value={query} />

<Panel title="Sources" pad={false} scroll>
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>Title</Table.Head>
				<Table.Head class="hidden md:table-cell">Publisher</Table.Head>
				<Table.Head class="hidden md:table-cell">Subject</Table.Head>
				<Table.Head class="text-right">Year</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each shown as row (row.id)}
				<Table.Row>
					<Table.Cell>{row.title}</Table.Cell>
					<Table.Cell class="hidden md:table-cell">{row.publisher}</Table.Cell>
					<Table.Cell class="hidden md:table-cell">{row.subject}</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{row.year}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</Panel>

<ContextColumn {stats} statsTitle="At a glance" />
