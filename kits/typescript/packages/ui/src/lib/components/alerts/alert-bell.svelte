<script lang="ts" module>
	/** One alert as the endpoint lists it: the app factory's `AlertRead`. */
	export type Alert = {
		id: number;
		key: string;
		title: string;
		body: string | null;
		link: string | null;
		raised_at: string;
		read_at: string | null;
	};
</script>

<script lang="ts">
	import Bell from '@lucide/svelte/icons/bell';
	import X from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Badge } from '../ui/badge/index.js';
	import { Button } from '../ui/button/index.js';
	import * as Popover from '../ui/popover/index.js';
	import { cn } from '$lib/utils';

	// The alerts bell: what machines told this deployment's operator, in the
	// shell's top-bar `actions` slot. App machinery like ReportWidget, mounted
	// once by the layout and talking to the app factory's own routes: GET
	// `<endpoint>/` lists, POST `<endpoint>/<id>/read` marks read, DELETE
	// `<endpoint>/<id>` dismisses.
	//
	// It renders NOTHING while no alert is open, so an app no producer writes
	// to carries no bell. The layout decides who may see it; the server's gate
	// is the real one.

	let {
		/** The app's alerts route, defaulting to the one every factory app serves. */
		endpoint = '/api/alerts'
	}: { endpoint?: string } = $props();

	const POLL_MS = 60_000;
	const TIMEOUT_MS = 30_000;
	const since = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

	let alerts: Alert[] = $state([]);
	let total = $state(0);
	let unread = $state(0);
	let open = $state(false);

	function call(path: string, method = 'GET'): Promise<Response | null> {
		return fetch(`${endpoint}/${path}`, { method, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(
			() => null
		);
	}

	// A failed poll keeps what the bell last showed and is not worth a toast:
	// the next one, a minute on, tries again.
	async function load() {
		const response = await call('');
		if (!response?.ok) return;
		const data = (await response.json()) as { alerts: Alert[]; total: number; unread: number };
		alerts = data.alerts;
		total = data.total;
		unread = data.unread;
	}

	async function act(path: string, method: string, failure: string) {
		const response = await call(path, method);
		if (!response?.ok) toast.error(failure);
		await load();
	}

	function markRead(alert: Alert) {
		if (alert.read_at) return;
		void act(`${alert.id}/read`, 'POST', 'Could not mark the alert read');
	}

	// Following a link closes the panel; the read is recorded on the way out.
	function follow(alert: Alert) {
		open = false;
		markRead(alert);
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
				<!-- size-9 is the shell's own top-bar control size (its search and
				     theme buttons), which size="icon" follows at one density only. -->
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
							<button type="button" class="min-w-0 flex-1 text-left" onclick={() => markRead(alert)}>
								{@render content(alert)}
							</button>
						{/if}
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Dismiss"
							onclick={() => void act(String(alert.id), 'DELETE', 'Could not dismiss the alert')}
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
