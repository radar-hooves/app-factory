<script lang="ts">
	// Fixture for scorecard.test.ts: forwards exactly the prop under test.
	import Scorecard from '$lib/components/ui/scorecard';

	let { scores }: { scores: (0 | 1 | 2)[] } = $props();
</script>

<Scorecard {scores} />
