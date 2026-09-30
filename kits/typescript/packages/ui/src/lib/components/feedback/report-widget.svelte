<script lang="ts" module>
	// In the module script so the instance script's typed state can reference
	// it: svelte2tsx emits a component's instance-script type declarations
	// below its `let`s, so a type both declared and referenced there turns
	// into "used before its declaration".
	type WidgetState = 'idle' | 'submitting' | 'done' | 'error';
</script>

<script lang="ts">
	import { toPng } from 'html-to-image';
	import Check from '@lucide/svelte/icons/check';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import MessageSquarePlus from '@lucide/svelte/icons/message-square-plus';
	import AppDialog from '../ui/app-dialog/app-dialog.svelte';
	import { Button } from '../ui/button/index.js';
	import { Checkbox } from '../ui/checkbox/index.js';
	import { Label } from '../ui/label/index.js';
	import Textarea from '../ui/textarea/textarea.svelte';
	import { getSessionId } from '$lib/telemetry';

	// The feedback widget every household app mounts: a fixed bottom-right
	// trigger opening the one report dialogue. It is deliberately NOT under
	// components/ui — it is app machinery the layout mounts once (alongside
	// initBrowserTelemetry), not page chrome a route composes from, so it does
	// not sit in the situation→component registry either.
	//
	// It renders as a layout-level sibling, outside whatever the route puts on
	// screen, so it cannot see a page's own bottom-right control (a chat
	// composer's Send) to avoid it. `--ds-report-clearance` is the seam: a
	// component that owns such a control claims it on the document while
	// mounted (`@poodle64/librarian`'s Conversation does, for its composer —
	// app-factory#15), and this trigger lifts clear of it. Absent, it defaults
	// to 0 and the trigger sits exactly where it always has.

	let {
		/** Where the report POSTs. The app's own route, defaulting to the one every household app serves. */
		endpoint = '/api/feedback',
		/** Fired with the id the endpoint returned, once, on the success leg. */
		onSubmitted
	}: {
		endpoint?: string;
		onSubmitted?: (id: string) => void;
	} = $props();

	let open = $state(false);
	let message = $state('');
	let includeScreenshot = $state(true);
	let phase: WidgetState = $state('idle');
	let submittedId: string | null = $state(null);

	// Instance-scoped element ids: a label's `for` has to reach its control,
	// and a page that mounts two widgets must not cross-wire their fields.
	const uid = Math.random().toString(36).slice(2, 10);
	const formId = `feedback-form-${uid}`;
	const messageId = `feedback-message-${uid}`;
	const screenshotId = `feedback-screenshot-${uid}`;

	async function submit() {
		phase = 'submitting';

		// A screenshot the page cannot produce (canvas-tainted content, a
		// browser without the API) is tolerated silently: the report still
		// sends, with a null image rather than no report at all.
		let screenshot: string | null = null;
		if (includeScreenshot) {
			screenshot = await toPng(document.body).catch(() => null);
		}

		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message,
					route: location.pathname,
					user_agent: navigator.userAgent,
					viewport: { width: window.innerWidth, height: window.innerHeight },
					session_id: getSessionId(),
					screenshot
				})
			});

			if (!response.ok) throw new Error(`the feedback endpoint answered ${response.status}`);

			const { id } = (await response.json()) as { id: string };
			submittedId = id;
			phase = 'done';
			onSubmitted?.(id);
		} catch {
			// The draft survives the failure — the message the user typed is
			// the hard half to reproduce, and losing it on a flaky connection
			// would make the retry cost more than the first attempt.
			phase = 'error';
		}
	}

	function reset() {
		// A sent report clears the dialogue for the next one; an abandoned
		// draft is kept, so an accidental close is not lost work.
		if (phase === 'done') {
			message = '';
			submittedId = null;
		}
		phase = 'idle';
	}
</script>

<!-- The floating trigger is the same shape the context column's is: a raw
     button in the house chrome rather than the Button primitive, because a
     Button's padding and text rhythm are for a row of actions, not a
     44px disc pinned over the page. -->
<button
	type="button"
	onclick={() => (open = true)}
	class="border-border bg-card text-muted-foreground hover:text-foreground ds-edge fixed right-4 bottom-[calc(1rem+var(--ds-report-clearance,0px)+env(safe-area-inset-bottom))] z-50 grid size-11 flex-none place-items-center rounded-full border transition-colors"
	aria-label="Report a problem"
>
	<MessageSquarePlus class="size-4.5" />
	<span class="sr-only">Report a problem</span>
</button>

<AppDialog
	bind:open
	title="Report a problem"
	subtitle="Describe what happened and the household team will take a look."
	size="sm"
	onOpenChange={(next) => !next && reset()}
>
	{#if phase === 'done'}
		<div class="flex flex-col items-start gap-3" data-testid="feedback-done">
			<span class="bg-primary/15 text-primary grid size-8 place-items-center rounded-md">
				<Check class="size-4" />
			</span>
			<p class="font-medium">Thank you — your report was received.</p>
			<p class="text-muted-foreground text-sm">
				Its reference is <span class="text-foreground font-medium" data-testid="feedback-id">{submittedId}</span
				>. Quote it if you follow it up.
			</p>
		</div>
	{:else}
		<form id={formId} onsubmit={(e) => { e.preventDefault(); submit(); }}>
			<div class="space-y-2">
				<Label for={messageId}>What happened?</Label>
				<Textarea
					id={messageId}
					bind:value={message}
					placeholder="What did you see, and what did you expect?"
				/>
			</div>
			<div class="mt-4 flex items-center gap-2">
				<Checkbox id={screenshotId} bind:checked={includeScreenshot} />
				<Label for={screenshotId}>Include a screenshot of this page</Label>
			</div>
			{#if phase === 'error'}
				<p class="text-destructive mt-4 flex items-center gap-2 text-sm" role="alert" data-testid="feedback-error">
					<CircleAlert class="size-4 flex-none" />
					Your report could not be sent. Check your connection and try again.
				</p>
			{/if}
		</form>
	{/if}

	{#snippet footer()}
		{#if phase === 'done'}
			<Button variant="outline" onclick={() => (open = false)}>Close</Button>
		{:else if phase === 'error'}
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button type="submit" form={formId} disabled={!message.trim()}>Retry</Button>
		{:else}
			<Button variant="outline" disabled={phase === 'submitting'} onclick={() => (open = false)}>
				Cancel
			</Button>
			<Button type="submit" form={formId} disabled={phase === 'submitting' || !message.trim()}>
				{#if phase === 'submitting'}
					<LoaderCircle class="size-4 animate-spin" />
				{/if}
				{phase === 'submitting' ? 'Sending…' : 'Send report'}
			</Button>
		{/if}
	{/snippet}
</AppDialog>
