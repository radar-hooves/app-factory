<script lang="ts">
	// Harness for the checkbox barrel-export regression. The import line is half
	// the test: `{ Checkbox }` must resolve to the styled wrapper, not to
	// bits-ui's compound namespace object. The bound-state probe reads the
	// two-way binding directly, so the toggle is proven from the component's
	// own state and not only from the attribute it paints.
	import { Checkbox } from '$lib/components/ui/checkbox';

	let checked = $state(false);
</script>

<Checkbox bind:checked aria-label="regression-checkbox" />
<span data-testid="checkbox-bound-state">{checked}</span>
