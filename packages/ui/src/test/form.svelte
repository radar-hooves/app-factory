<script lang="ts">
	/**
	 * A real superforms-backed form, because the claim being tested is the ARIA
	 * WIRING — which id points at which element, which attribute flips when a
	 * field errors — and Formsnap derives all of it from a live form store. A
	 * mocked store would assert the wrappers' markup and nothing about the
	 * behaviour that made three apps vendor them.
	 */
	import { superForm, defaults } from 'sveltekit-superforms';
	import * as Form from '$lib/components/ui/form/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	// A plain adapter: the schema library is the app's choice, and the wrappers
	// never see it. Constraints are declared directly so the harness carries no
	// validation dependency of its own.
	const adapter = {
		superFormValidationLibrary: 'custom' as const,
		jsonSchema: {
			type: 'object' as const,
			properties: { title: { type: 'string' as const } },
			required: ['title']
		},
		defaults: { title: '' },
		constraints: { title: { required: true } },
		validate: async () => ({ success: false, issues: [{ message: 'Title is required' }] }),
		async validators() {}
	};

	const form = superForm(defaults({ title: '' }, adapter as never), {
		SPA: true,
		validators: adapter as never,
		id: 'test-form'
	});
	const { form: formData, errors } = form;

	export function raiseError() {
		errors.set({ title: ['Title is required'] });
	}
</script>

<form data-testid="form">
	<Form.Field {form} name="title" data-testid="field">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label data-testid="label">Title</Form.Label>
				<Input {...props} bind:value={$formData.title} data-testid="input" />
			{/snippet}
		</Form.Control>
		<Form.Description data-testid="description">What the record is called.</Form.Description>
		<Form.FieldErrors data-testid="errors" />
	</Form.Field>
	<Form.Button data-testid="submit">Save</Form.Button>
</form>
