<svelte:options
	customElement={{ tag: 'selftest-card', props: { count: { type: 'Number' } }, extend: element }}
/>

<script module lang="ts">
	import { element } from '$lib/elements';
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { Badge } from '@poodle64/ui/badge';
	import { Button } from '@poodle64/ui/button';
	import * as Card from '@poodle64/ui/card';
	import { api, signInUrl, signingIn } from '$lib/elements';

	interface Props {
		/** The app this card is placed in; empty on the service's own page. */
		app?: string;
		count?: number;
	}

	let { app = '', count = 0 }: Props = $props();

	let read = $state('Reading its app…');

	onMount(async () => {
		const { data, response } = await api.GET('/api/system/database-environment');
		if (data) read = `Read from its app: ${data.environment}`;
		else if (response.status !== 401) read = `Its app answered ${response.status}`;
		else read = signingIn() ? 'Signing you in…' : 'Not signed in';
	});
</script>

<Card.Root class="max-w-sm">
	<Card.Header>
		<Card.Title>Self-test element</Card.Title>
		<Card.Description>{app ? `Placed in ${app}` : 'On its own page'}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col items-start gap-3">
		<p data-testid="read">
			{read}
			{#if read === 'Not signed in'}<a href={signInUrl()}>Sign in</a>{/if}
		</p>
		<div class="flex items-center gap-3">
			<Button data-testid="primary">Primary</Button>
			<Badge variant="outline">{count}</Badge>
		</div>
		<!-- Shown only by the kit's `dark:` variant, which the page's mode drives. -->
		<span data-testid="dark" class="hidden dark:block"></span>
	</Card.Content>
</Card.Root>
