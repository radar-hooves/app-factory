<script lang="ts">
	/** A superforms 3 form with a zod client validator, rendered through the kit's Form.Field. */
	import { superForm, defaults } from 'sveltekit-superforms';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import * as Form from '@poodle64/ui/form';
	import { Input } from '@poodle64/ui/input';

	const schema = z.object({ title: z.string().min(1, 'Title is required') });

	const form = superForm(defaults({ title: 'x' }, zod4(schema)), {
		SPA: true,
		validators: zod4Client(schema),
		id: 'field-form'
	});
	const { form: formData, enhance } = form;
</script>

<form method="POST" use:enhance>
	<Form.Field {form} name="title">
		<Form.Control>
			{#snippet children({ props })}
				<Form.Label>Title</Form.Label>
				<Input {...props} bind:value={$formData.title} />
			{/snippet}
		</Form.Control>
		<Form.FieldErrors />
	</Form.Field>
	<Form.Button>Save</Form.Button>
</form>
