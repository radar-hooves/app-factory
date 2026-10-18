<script lang="ts">
	// Fixture for sheet.test.ts: a sheet opened by its own trigger, on any side.
	import * as Sheet from '$lib/components/ui/sheet/index.js';

	let { side }: { side?: 'top' | 'right' | 'bottom' | 'left' } = $props();
</script>

<Sheet.Root>
	<Sheet.Trigger>Open filters</Sheet.Trigger>
	<Sheet.Content {side}>
		<Sheet.Header>
			<Sheet.Title>Filters</Sheet.Title>
			<Sheet.Description>Narrow the list.</Sheet.Description>
		</Sheet.Header>
		<Sheet.Body><p>Sheet body</p></Sheet.Body>
		<Sheet.Footer><button type="button">Apply</button></Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
