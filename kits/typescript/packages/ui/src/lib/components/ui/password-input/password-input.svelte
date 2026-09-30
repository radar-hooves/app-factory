<script lang="ts">
	import { cn } from '$lib/utils.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = Omit<HTMLInputAttributes, 'type' | 'files'> & {
		value?: string;
		class?: string;
	};

	let { value = $bindable(''), id, class: className, disabled, ...rest }: Props = $props();

	let revealed = $state(false);
</script>

<InputGroup.Root class={cn('h-9 font-mono text-sm', className)}>
	<InputGroup.Input
		{id}
		type={revealed ? 'text' : 'password'}
		bind:value
		{disabled}
		class="font-mono text-sm"
		{...rest}
	/>
	<InputGroup.Addon align="inline-end">
		<InputGroup.Button
			type="button"
			variant="ghost"
			size="icon-xs"
			class="text-muted-foreground"
			{disabled}
			aria-label={revealed ? 'Hide password' : 'Show password'}
			aria-pressed={revealed}
			aria-controls={id}
			onclick={() => {
				revealed = !revealed;
			}}
		>
			{#if revealed}
				<EyeOff class="size-4" aria-hidden="true" />
			{:else}
				<Eye class="size-4" aria-hidden="true" />
			{/if}
		</InputGroup.Button>
	</InputGroup.Addon>
</InputGroup.Root>
