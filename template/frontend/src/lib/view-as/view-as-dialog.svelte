<!--
	"View as colleague": an admin ticks which of their own entitlements to keep,
	and the app then looks the way someone holding only those sees it.

	It can only narrow. The server intersects the ticked names with what the
	account truly holds, so nothing here can add one, and it is held per browser
	tab (the auth store), so a new tab is the admin's own view again.
-->
<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import { AppDialog } from '@poodle64/ui/app-dialog';
	import { Button } from '@poodle64/ui/button';
	import { Checkbox } from '@poodle64/ui/checkbox';
	import { Label } from '@poodle64/ui/label';
	import { auth } from '$lib/auth.svelte';
	import { reloadPage } from './reload';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let kept = $state<string[]>([]);

	// Opens on what is being viewed now, or on everything held.
	$effect(() => {
		if (open) kept = auth.viewingAs ? [...auth.entitlements] : [...auth.held];
	});

	function toggle(name: string, on: boolean) {
		kept = on ? [...kept, name] : kept.filter((k) => k !== name);
	}

	function apply() {
		auth.viewAsColleague(kept);
		open = false;
		reloadPage();
	}
</script>

<AppDialog
	bind:open
	title="View as colleague"
	subtitle="Untick what a colleague does not have. Only your own entitlements are listed, so this can narrow what you see and never widen it."
	icon={Eye}
	size="sm"
>
	<ul class="space-y-3" data-testid="view-as-list">
		{#each auth.held as name (name)}
			<li class="flex items-center gap-2">
				<Checkbox
					id="view-as-{name}"
					checked={kept.includes(name)}
					onCheckedChange={(on) => toggle(name, on === true)}
				/>
				<Label for="view-as-{name}" class="font-mono text-sm">{name}</Label>
			</li>
		{/each}
	</ul>
	<p class="text-muted-foreground mt-4 text-xs">
		The collections the library shows are still the ones you can read yourself.
	</p>
	{#snippet footer()}
		<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
		<Button onclick={apply} data-testid="view-as-apply">Apply</Button>
	{/snippet}
</AppDialog>
