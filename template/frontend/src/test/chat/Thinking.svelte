<!-- A test app's `ChatExtensions.Thinking`. -->
<script lang="ts">
	import type { Persona } from '$lib/agent/chat';

	let { persona, since }: { persona: Persona; label?: string; since?: number } = $props();
</script>

<p data-testid="app-thinking" data-since={since}>{persona.name} has the kettle on</p>
