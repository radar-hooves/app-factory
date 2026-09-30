<script lang="ts">
	// Fixture for bar-row.test.ts: forwards exactly the props the tests vary.
	import BarRow from '$lib/components/ui/bar-row';

	let {
		label,
		value,
		pct,
		color,
		labelWidth
	}: {
		label: string;
		value: string | number;
		pct: number;
		color?: string;
		labelWidth?: string;
	} = $props();
</script>

<BarRow {label} {value} {pct} {color} {labelWidth} />
