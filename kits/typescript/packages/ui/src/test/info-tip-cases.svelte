<script lang="ts">
	// The two forms of InfoTip, rendered from one harness so the gate compares
	// them against each other rather than against a table someone typed.
	import InfoTip from '../lib/components/ui/info-tip/info-tip.svelte';

	let { bare, wrapped }: { bare?: string; wrapped?: string } = $props();
</script>

{#if bare}
	<InfoTip text={bare} />
{/if}

{#if wrapped}
	<InfoTip text={wrapped}>
		<span class="size-2 rounded-full">●</span>
	</InfoTip>
{/if}
