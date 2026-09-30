<script lang="ts">
	// Fixture for table.test.ts: the two class seams on one table, so a test can
	// prove they land on different boxes rather than merging into one.
	import * as Table from '$lib/components/ui/table';
</script>

<Table.Root class="table-fixed" containerClass="max-h-64 rounded-lg">
	<Table.Header>
		<Table.Row>
			<Table.Head>Name</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		<Table.Row>
			<Table.Cell>record-1</Table.Cell>
		</Table.Row>
	</Table.Body>
</Table.Root>
