<script lang="ts">
	// Fixture for status-badge.test.ts: forwards exactly the props the tests vary.
	import StatusBadge from '#lib/components/ui/status-badge/index.js';
	import type { Status } from '#lib/components/ui/status/index.js';

	let {
		status,
		label,
		pulse,
		class: className
	}: {
		status: Status | 'primary';
		label: string;
		pulse?: boolean;
		class?: string;
	} = $props();
</script>

<StatusBadge {status} {label} {pulse} class={className} />
