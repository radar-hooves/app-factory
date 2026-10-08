<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';
	import { mode } from 'mode-watcher';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	let { toastOptions = {}, ...restProps }: SonnerProps = $props();
	const options = $derived({
		...toastOptions,
		style: 'font-family: var(--ds-font-body, inherit); font-size: var(--ds-text-sm, 0.875rem); ' + (toastOptions.style ?? ''),
		classes: {
			icon: 'size-4!',
			content: 'min-w-0 max-h-[calc(100dvh-6rem)] overflow-y-auto',
			title: 'whitespace-pre-wrap [overflow-wrap:anywhere]',
			description: 'whitespace-pre-wrap [overflow-wrap:anywhere] text-inherit!',
			...toastOptions.classes
		}
	});
</script>

<Sonner
	theme={mode.current}
	position="top-right"
	closeButton
	richColors={false}
	toastOptions={options}
	class="toaster group"
	style="--normal-bg: var(--popover, var(--ds-color-surface-3)); --normal-text: var(--popover-foreground, var(--ds-color-foreground)); --normal-border: var(--border);"
	{...restProps}
>
	{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4" />
	{/snippet}
	{#snippet infoIcon()}
		<InfoIcon class="size-4" />
	{/snippet}
	{#snippet warningIcon()}
		<TriangleAlertIcon class="size-4" />
	{/snippet}
</Sonner>
