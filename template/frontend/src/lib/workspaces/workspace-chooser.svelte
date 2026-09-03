<!--
	Shown INSTEAD of a page while the caller holds several workspaces and has
	chosen none — the first sign-in after a grant, or a cleared browser.

	The alternative is a silent default, and a silent default is how household
	data lands in a personal workspace (`rules-library/platform/tenancy.md`
	§Enforcement). The backend refuses the ambiguous request with a 409 carrying
	the choices; this is the surface that turns that refusal into a choice
	before any page has asked.
-->
<script lang="ts">
	import Layers from '@lucide/svelte/icons/layers';
	import { Button } from '@poodle64/ui/button';
	import { EmptyState } from '@poodle64/ui/empty-state';
	import { auth } from '$lib/auth.svelte';

	let { label = 'Workspace' }: { label?: string } = $props();
	const noun = $derived(label.toLowerCase());
</script>

<EmptyState
	icon={Layers}
	title="Choose a {noun}"
	description="You belong to more than one. Every page shows the {noun} you pick, until you switch."
	data-testid="workspace-chooser"
>
	{#snippet action()}
		<div class="flex flex-wrap justify-center gap-2">
			{#each auth.workspaces as membership (membership.workspace.id)}
				<Button variant="outline" onclick={() => auth.setActiveWorkspace(membership.workspace.id)}>
					{membership.workspace.name}
				</Button>
			{/each}
		</div>
	{/snippet}
</EmptyState>
