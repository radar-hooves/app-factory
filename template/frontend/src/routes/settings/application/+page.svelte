<!--
	Every declared Setting (docs/design/settings.md), rendered from the JSON
	Schema `GET /api/settings/` returns — `<SchemaForm>` generates its own
	layout from the schema alone, so an app that declares a setting adds no
	code here. The one piece of page-specific UI is the panel below the form:
	`<SchemaForm>` has no per-field reset affordance, so "default versus
	override, reset in one act" (the operator's own ask) lives here instead.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import Panel from '@poodle64/ui/panel';
	import PageHeader from '@poodle64/ui/page-header';
	import LoadingState from '@poodle64/ui/loading-state';
	import { Button } from '@poodle64/ui/button';
	import SchemaForm, { type SchemaFormChange } from '@poodle64/ui/schema-form';
	import { api, extractApiError } from '$api';
	import type { components } from '$api/schema';

	type SettingsDocument = components['schemas']['SettingsDocument'];
	/** The one shape this page reads out of the JSON Schema `SchemaForm` itself treats opaquely. */
	interface FieldSchema {
		properties?: Record<string, { title?: string }>;
	}

	let settingsDoc = $state<SettingsDocument | null>(null);
	let loadError = $state<string | null>(null);
	/** Keys whose effective value differs from its default — derived, never a second copy the API and this page could disagree on. */
	let overridden = $derived(
		settingsDoc
			? Object.keys(settingsDoc.value).filter(
					(key) => settingsDoc!.value[key] !== settingsDoc!.defaults[key]
				)
			: []
	);

	async function load() {
		const { data, error } = await api.GET('/api/settings/');
		if (error) {
			loadError = extractApiError(error).description;
			return;
		}
		loadError = null;
		settingsDoc = data as SettingsDocument;
	}

	onMount(load);

	async function handleChange(_next: Record<string, unknown>, change: SchemaFormChange) {
		if (!settingsDoc) return;
		const key = change.path;
		const previous = settingsDoc.value[key];
		settingsDoc.value[key] = change.value as never;

		const { data, error } = await api.PATCH('/api/settings/{key}', {
			params: { path: { key } },
			body: { value: change.value as never }
		});
		if (error) {
			if (previous !== undefined) settingsDoc.value[key] = previous;
			const info = extractApiError(error);
			toast.error(info.title, { description: info.description });
			return;
		}
		settingsDoc.value[key] = data.value as never;
	}

	async function resetSetting(key: string) {
		if (!settingsDoc) return;
		const { data, error } = await api.POST('/api/settings/{key}/reset', {
			params: { path: { key } }
		});
		if (error) {
			const info = extractApiError(error);
			toast.error(info.title, { description: info.description });
			return;
		}
		settingsDoc.value[key] = data.value as never;
	}
</script>

<PageHeader
	title="Application"
	subtitle="Runtime settings this deployment's operator can change without a code change or a deploy."
/>

{#if loadError}
	<Panel title="Could not load settings" tone="destructive">{loadError}</Panel>
{:else if !settingsDoc}
	<LoadingState message="Loading…" class="mt-16" />
{:else}
	<Panel title="Settings">
		<SchemaForm schema={settingsDoc.schema} value={settingsDoc.value} onChange={handleChange} />
	</Panel>

	{#if overridden.length}
		<Panel title="Overridden from default" subtitle="{overridden.length} changed">
			<ul class="grid gap-2">
				{#each overridden as key (key)}
					{@const label = (settingsDoc.schema as FieldSchema).properties?.[key]?.title ?? key}
					<li class="flex items-center justify-between gap-4">
						<span class="text-sm">
							{label}
							<span class="text-muted-foreground font-mono text-xs">
								default: {settingsDoc.defaults[key]}
							</span>
						</span>
						<Button variant="outline" size="sm" onclick={() => resetSetting(key)}>Reset</Button>
					</li>
				{/each}
			</ul>
		</Panel>
	{/if}
{/if}
