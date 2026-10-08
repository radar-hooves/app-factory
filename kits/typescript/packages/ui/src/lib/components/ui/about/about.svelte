<script lang="ts">
	import type { Snippet } from 'svelte';
	import { toast } from 'svelte-sonner';
	import Panel from '../panel/panel.svelte';
	import FactGrid from '../fact-grid/fact-grid.svelte';
	import Button from '../button/button.svelte';

	let { name, version, description, brand, links = [], diagnostics = {},
		writeClipboard = (text: string) => navigator.clipboard.writeText(text) }: {
		name: string;
		version: string;
		description?: string;
		brand?: Snippet;
		links?: readonly { label: string; href: string }[];
		/** Explicit non-sensitive fields, never a settings/environment object. */
		diagnostics?: Record<string, string>;
		/** Pass the host's clipboard API directly where the browser API is unavailable. */
		writeClipboard?: (text: string) => Promise<void>;
	} = $props();
	const facts = $derived([
		{ key: 'version', label: 'Version', value: version },
		...Object.entries(diagnostics).map(([label, value]) => ({ key: `diagnostic:${label}`, label, value }))
	]);

	async function copyDiagnostics() {
		try {
			await writeClipboard(`${name}\n${facts.map((fact) => `${fact.label}: ${fact.value}`).join('\n')}`);
			toast.success('Diagnostics copied');
		} catch {
			toast.error('Could not copy diagnostics', { description: 'Clipboard access is unavailable.' });
		}
	}
</script>

<Panel title={name} {description}>
	<div class="flex flex-col gap-4">
		{#if brand}{@render brand()}{/if}
		<FactGrid {facts} />
		<div class="flex flex-wrap gap-2">
			{#each links as link}
				<Button variant="outline" href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</Button>
			{/each}
			<Button variant="outline" onclick={copyDiagnostics}>Copy diagnostics</Button>
		</div>
	</div>
</Panel>
