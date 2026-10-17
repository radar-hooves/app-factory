<svelte:options
	customElement={{ tag: 'selftest-card', props: { count: { type: 'Number' } }, extend: element }}
/>

<script module lang="ts">
	import { element } from '$lib/elements';
</script>

<script lang="ts">
	import { Badge } from '@poodle64/ui/badge';
	import { Button } from '@poodle64/ui/button';
	import * as Card from '@poodle64/ui/card';

	interface Props {
		/** The app this card is placed in; empty on the service's own page. */
		app?: string;
		count?: number;
	}

	let { app = '', count = 0 }: Props = $props();
</script>

<Card.Root class="max-w-sm">
	<Card.Header>
		<Card.Title>Self-test element</Card.Title>
		<Card.Description>{app ? `Placed in ${app}` : 'On its own page'}</Card.Description>
	</Card.Header>
	<Card.Content class="flex items-center gap-3">
		<Button data-testid="primary">Primary</Button>
		<Badge variant="outline">{count}</Badge>
		<!-- Shown only by the kit's `dark:` variant, which the page's mode drives. -->
		<span data-testid="dark" class="hidden dark:block"></span>
	</Card.Content>
</Card.Root>
