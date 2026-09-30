<script lang="ts">
	// Harness for the announcement contract on the async-outcome surfaces. The
	// claim under test is not that these components render an ARIA attribute —
	// it is that the live region exists at the instant the outcome ARRIVES,
	// which is the only instant a screen reader has to announce it. So every
	// state here is reached by DRIVING a load, never by mounting the finished
	// markup (rules-library/core/73-verification.md §"Behaviour vs Appearance").
	// The load is gated on a button rather than a timer so the test observes the
	// in-flight and settled phases as two distinct instants.
	import EmptyState from '$lib/components/ui/empty-state/empty-state.svelte';
	import ErrorState from '$lib/components/ui/error-state/error-state.svelte';
	import LoadingState from '$lib/components/ui/loading-state/loading-state.svelte';

	type Phase = 'idle' | 'loading' | 'failed' | 'empty';

	let phase: Phase = $state('idle');
</script>

<button type="button" onclick={() => (phase = 'loading')}>Start load</button>
<button type="button" onclick={() => (phase = 'failed')}>Fail the load</button>
<button type="button" onclick={() => (phase = 'empty')}>Settle with no rows</button>
<!-- A <span>, not the <output> probe the other harnesses use: <output> carries an
     implicit role="status", which would collide with the very region under test. -->
<span data-testid="phase">{phase}</span>

{#if phase === 'loading'}
	<LoadingState message="Fetching records…" />
{:else if phase === 'failed'}
	<ErrorState message="Could not load the estate." />
{:else if phase === 'empty'}
	<EmptyState title="No records" description="Nothing matched that filter." />
{/if}
