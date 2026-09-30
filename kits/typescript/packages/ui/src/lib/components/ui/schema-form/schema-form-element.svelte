<script lang="ts">
	import { isVisible, type ControlElement, type UISchemaElement } from '@jsonforms/core';
	import Panel from '../panel/panel.svelte';
	import * as Tabs from '../tabs/index.js';
	import SchemaFormControl from './schema-form-control.svelte';
	import UnknownField from './widgets/unknown-field.svelte';
	import Self from './schema-form-element.svelte';
	import { getSchemaFormContext } from './context.js';

	/**
	 * One node of the UI Schema tree, recursively.
	 *
	 * The vocabulary walked here is JSON Forms' own: VerticalLayout,
	 * HorizontalLayout, Group, Categorization/Category, Control and Label. An
	 * element type outside it renders as a flagged fallback — the previous
	 * renderers treated an unknown node as nothing to do, which is how a nested
	 * hint became inert without any signal.
	 *
	 * SHOW/HIDE is evaluated here rather than inside the control, so a rule on a
	 * Group hides the whole group, which is what an author writing one means.
	 */
	let { element }: { element: UISchemaElement } = $props();

	const form = getSchemaFormContext();

	const visible = $derived(isVisible(element, form.data, '', form.ajv, undefined));
	const children = $derived(((element as { elements?: UISchemaElement[] }).elements ?? []));
	const label = $derived(
		typeof (element as { label?: unknown }).label === 'string'
			? ((element as { label: string }).label)
			: undefined
	);
</script>

{#if visible}
	{#if element.type === 'VerticalLayout'}
		<div class="grid gap-4" data-schema-form-layout="vertical">
			{#each children as child, index (index)}
				<Self element={child} />
			{/each}
		</div>
	{:else if element.type === 'HorizontalLayout'}
		<!-- Columns of equal width on a wide viewport, one stack below it. The
		     column count follows the element count, so a layout never needs a
		     breakpoint written per form. -->
		<div class="grid gap-4 sm:auto-cols-fr sm:grid-flow-col" data-schema-form-layout="horizontal">
			{#each children as child, index (index)}
				<Self element={child} />
			{/each}
		</div>
	{:else if element.type === 'Group'}
		<Panel title={label} data-schema-form-layout="group">
			<div class="grid gap-4">
				{#each children as child, index (index)}
					<Self element={child} />
				{/each}
			</div>
		</Panel>
	{:else if element.type === 'Categorization'}
		{@const categories = children.filter((child) => isVisible(child, form.data, '', form.ajv, undefined))}
		{#if categories.length}
			<Tabs.Root value="category-0" data-schema-form-layout="categorization">
				<Tabs.List>
					{#each categories as category, index (index)}
						<Tabs.Trigger value="category-{index}">
							{(category as { label?: string }).label ?? `Section ${index + 1}`}
						</Tabs.Trigger>
					{/each}
				</Tabs.List>
				{#each categories as category, index (index)}
					<Tabs.Content value="category-{index}" class="pt-4">
						<div class="grid gap-4">
							{#each (category as { elements?: UISchemaElement[] }).elements ?? [] as child, position (position)}
								<Self element={child} />
							{/each}
						</div>
					</Tabs.Content>
				{/each}
			</Tabs.Root>
		{/if}
	{:else if element.type === 'Category'}
		<!-- A Category outside a Categorization is still a section of fields. -->
		<div class="grid gap-4" data-schema-form-layout="category">
			{#each children as child, index (index)}
				<Self element={child} />
			{/each}
		</div>
	{:else if element.type === 'Control'}
		<SchemaFormControl element={element as ControlElement} />
	{:else if element.type === 'Label'}
		<p class="text-2xs text-muted-foreground font-semibold tracking-wide uppercase">
			{(element as { text?: string }).text ?? label ?? ''}
		</p>
	{:else}
		<UnknownField
			id="unknown-element"
			label={label ?? element.type}
			scope="(ui schema element)"
			path=""
			reason="unknown-element"
			detail={`"${element.type}" is not a UI schema element this renderer knows`}
			value={element}
		/>
	{/if}
{/if}
