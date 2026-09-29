<!--
	The alerts bell: what machines told this deployment's operator
	(`docs/design/alerts.md`), in the shell's top-bar `actions` slot.

	Renders NOTHING while nothing is open, the workspace menu's rule for a
	control with nothing to show: a deployment no producer writes to carries
	no bell. The layout mounts it only for a caller holding `admin`; the
	server's gate on `/api/alerts` is the real one.

	`size-9` is the shell's own top-bar control size (its search and theme
	buttons), which `size="icon"` follows only at one density.

	Polls once a minute, and again as the panel opens. Opening an alert marks
	it read and follows its link; the cross dismisses it until its producer
	raises it again.
-->
<script lang="ts">
	import Bell from '@lucide/svelte/icons/bell';
	import X from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';
	import { Badge } from '@poodle64/ui/badge';
	import { Button } from '@poodle64/ui/button';
	import * as Popover from '@poodle64/ui/popover';
	import { api, toastApiError } from '$lib/api';
	import type { components } from '$api/schema';
	import { cn } from '$lib/utils';

	type Alert = components['schemas']['AlertRead'];

	const POLL_MS = 60_000;
	const since = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

	let alerts = $state<Alert[]>([]);
	let total = $state(0);
	let unread = $state(0);
	let open = $state(false);

	// A failed poll keeps what the bell last showed and is not worth a toast:
	// the next one, a minute on, tries again.
	async function load() {
		const { data } = await api.GET('/api/alerts/');
		if (!data) return;
		alerts = data.alerts;
		total = data.total;
		unread = data.unread;
	}

	async function markRead(alert: Alert) {
		if (alert.read_at) return;
		const { error } = await api.POST('/api/alerts/{alert_id}/read', {
			params: { path: { alert_id: alert.id } }
		});
		if (error) toastApiError(error, 'Could not mark the alert read');
		await load();
	}

	async function dismiss(alert: Alert) {
		const { error } = await api.DELETE('/api/alerts/{alert_id}', {
			params: { path: { alert_id: alert.id } }
		});
		if (error) toastApiError(error, 'Could not dismiss the alert');
		await load();
	}

	// Following a link closes the panel; the read is recorded on the way out.
	function follow(alert: Alert) {
		open = false;
		void markRead(alert);
	}

	function age(iso: string): string {
		const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
		if (minutes > -60) return since.format(minutes, 'minute');
		if (minutes > -60 * 24) return since.format(Math.round(minutes / 60), 'hour');
		return since.format(Math.round(minutes / (60 * 24)), 'day');
	}

	onMount(() => {
		void load();
		const timer = setInterval(() => void load(), POLL_MS);
		return () => clearInterval(timer);
	});
</script>

{#if total > 0}
	<Popover.Root bind:open onOpenChange={(opened) => opened && void load()}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="outline"
					size="icon"
					class="relative size-9"
					aria-label={unread > 0 ? `Alerts, ${unread} unread` : 'Alerts'}
					data-testid="alert-bell"
				>
					<Bell />
					{#if unread > 0}
						<Badge
							class="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1"
							aria-hidden="true"
							data-testid="alert-bell-unread"
						>
							{unread > 99 ? '99+' : unread}
						</Badge>
					{/if}
				</Button>
			{/snippet}
		</Popover.Trigger>

		<Popover.Content align="end" class="w-96 p-0">
			<p class="border-b px-4 py-3 text-sm font-semibold">Alerts</p>
			<ul class="divide-y">
				{#each alerts as alert (alert.id)}
					<li class="flex items-start gap-2 px-4 py-3" data-testid="alert-item">
						<span
							class={cn('mt-1.5 size-2 shrink-0 rounded-full', !alert.read_at && 'bg-primary')}
							aria-hidden="true"
						></span>
						{#if alert.link}
							<a
								href={alert.link}
								class="min-w-0 flex-1 text-left"
								target={alert.link.startsWith('/') ? undefined : '_blank'}
								rel={alert.link.startsWith('/') ? undefined : 'noreferrer'}
								onclick={() => follow(alert)}
							>
								{@render content(alert)}
							</a>
						{:else}
							<button
								type="button"
								class="min-w-0 flex-1 text-left"
								onclick={() => void markRead(alert)}
							>
								{@render content(alert)}
							</button>
						{/if}
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Dismiss"
							onclick={() => void dismiss(alert)}
							data-testid="alert-dismiss"
						>
							<X />
						</Button>
					</li>
				{/each}
			</ul>
			{#if total > alerts.length}
				<p class="text-muted-foreground border-t px-4 py-2 text-xs">
					Showing the newest {alerts.length} of {total}.
				</p>
			{/if}
		</Popover.Content>
	</Popover.Root>
{/if}

{#snippet content(alert: Alert)}
	<span class={cn('block text-sm leading-tight', !alert.read_at && 'font-medium')}>
		{alert.title}
	</span>
	{#if alert.body}
		<span class="text-muted-foreground mt-1 block text-xs whitespace-pre-line">{alert.body}</span>
	{/if}
	<span class="text-muted-foreground mt-1 block text-xs">{age(alert.raised_at)}</span>
{/snippet}
