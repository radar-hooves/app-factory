<!--
	The runtime settings page for app-slices' settings routes: every declared
	Setting, rendered from the JSON Schema `GET <endpoint>/` returns, nested by
	dot path and laid out one group per domain (`nest.ts`), so an app that
	declares a setting adds no code here. `<SchemaForm>` has no per-field reset,
	so "default versus override, reset in one act" (the operator's own ask) is
	the panel below it. An app mounts it as its settings route's whole body.
-->
<script lang="ts" module>
	import type { JsonSchema } from '../ui/schema-form/index.js';

	export type SettingValue = boolean | number | string;

	/** What `GET <endpoint>/` answers: app-slices' `SettingsDocument`. */
	export type SettingsDocument = {
		schema: JsonSchema;
		value: Record<string, SettingValue>;
		defaults: Record<string, SettingValue>;
	};
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '../ui/button/index.js';
	import { LoadingState } from '../ui/loading-state/index.js';
	import { PageHeader } from '../ui/page-header/index.js';
	import { Panel } from '../ui/panel/index.js';
	import { SchemaForm, type SchemaFormChange } from '../ui/schema-form/index.js';
	import { nestSchema, nestValues, settingsLayout } from './nest.js';

	let {
		/** The app's settings routes, defaulting to where the factory mounts them. */
		endpoint = '/api/settings',
		title = 'Application',
		subtitle = "Runtime settings this deployment's operator can change without a code change or a deploy."
	}: { endpoint?: string; title?: string; subtitle?: string } = $props();

	const TIMEOUT_MS = 30_000;

	let doc = $state<SettingsDocument | null>(null);
	let loadError = $state<string | null>(null);
	/** What `<SchemaForm>` renders: the flat document nested by dot path; the flat one stays the state. */
	let formSchema = $derived(doc ? nestSchema(doc.schema) : null);
	let formValue = $derived(doc ? nestValues(doc.value) : {});
	let formLayout = $derived(formSchema ? settingsLayout(formSchema) : undefined);
	/** Keys whose effective value differs from its default — derived, never a second copy to disagree with the API. */
	let overridden = $derived(
		doc ? Object.keys(doc.value).filter((key) => doc!.value[key] !== doc!.defaults[key]) : []
	);

	/** The body on success, or the household error body's `message` (`{"error", "message"}`). */
	async function call<T>(
		path: string,
		init: RequestInit = {}
	): Promise<{ data: T } | { failure: string }> {
		let response: Response;
		try {
			response = await fetch(`${endpoint}/${path}`, {
				...init,
				signal: AbortSignal.timeout(TIMEOUT_MS)
			});
		} catch {
			return { failure: 'The server could not be reached.' };
		}
		const body = await response.json().catch(() => null);
		if (response.ok) return { data: body as T };
		return { failure: body?.message ?? `The server answered ${response.status}.` };
	}

	async function load() {
		const result = await call<SettingsDocument>('');
		if ('failure' in result) {
			loadError = result.failure;
			return;
		}
		loadError = null;
		doc = result.data;
	}

	onMount(load);

	async function save(key: string, path: string, init: RequestInit, failure: string) {
		const result = await call<{ value: SettingValue }>(path, init);
		if ('failure' in result) {
			toast.error(failure, { description: result.failure });
			return false;
		}
		doc!.value[key] = result.data.value;
		return true;
	}

	async function handleChange(_next: Record<string, unknown>, change: SchemaFormChange) {
		if (!doc) return;
		const key = change.path;
		const previous = doc.value[key];
		doc.value[key] = change.value as SettingValue;
		const saved = await save(
			key,
			encodeURIComponent(key),
			{
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ value: change.value })
			},
			'Could not save the setting'
		);
		if (!saved && previous !== undefined) doc.value[key] = previous;
	}

	function reset(key: string) {
		void save(key, `${encodeURIComponent(key)}/reset`, { method: 'POST' }, 'Could not reset the setting');
	}

	function label(key: string): string {
		const properties = (doc!.schema as { properties?: Record<string, { title?: string }> }).properties;
		return properties?.[key]?.title ?? key;
	}
</script>

<PageHeader {title} {subtitle} />

{#if loadError}
	<Panel title="Could not load settings" tone="destructive">{loadError}</Panel>
{:else if !doc}
	<LoadingState message="Loading…" class="mt-16" />
{:else}
	<Panel title="Settings">
		<SchemaForm schema={formSchema!} uischema={formLayout} value={formValue} onChange={handleChange} />
	</Panel>

	{#if overridden.length}
		<Panel title="Overridden from default" subtitle="{overridden.length} changed">
			<ul class="grid gap-2">
				{#each overridden as key (key)}
					<li class="flex items-center justify-between gap-4">
						<span class="text-sm">
							{label(key)}
							<span class="text-muted-foreground font-mono text-xs">
								default: {doc.defaults[key]}
							</span>
						</span>
						<Button variant="outline" size="sm" onclick={() => reset(key)}>Reset</Button>
					</li>
				{/each}
			</ul>
		</Panel>
	{/if}
{/if}
