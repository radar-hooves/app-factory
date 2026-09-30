<script lang="ts">
	// Fixture for arc-gauge.test.ts: forwards exactly the props the tests vary.
	import ArcGauge, { type GaugeTone } from '$lib/components/ui/arc-gauge';

	let {
		pct,
		tone,
		size,
		showLabel,
		label
	}: {
		pct?: number;
		tone?: GaugeTone;
		size?: number;
		showLabel?: boolean;
		label?: string;
	} = $props();
</script>

<ArcGauge {pct} {tone} {size} {showLabel} {label} />
