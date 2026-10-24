<script lang="ts">
	import { PageAside } from '@poodle64/ui/app-shell';
	import { PageHeader } from '@poodle64/ui/page-header';
	import { PageSection } from '@poodle64/ui/page-section';
	import { Panel } from '@poodle64/ui/panel';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	// A reading page with an aside, shaped like an app's security page: a
	// verdict, a run of questions, and two notes beside them.
	const questions = [
		{
			q: 'Who can get in?',
			a: 'Only colleagues the operator invites. Signing in takes a password and a second step, and repeated wrong passwords lock the account.'
		},
		{
			q: 'What does it keep about me?',
			a: 'Your sign-in name, your conversations and any feedback you send. Sign-in records are kept for a year, and conversations until you delete them.'
		},
		{
			q: 'Where does it run, and is it backed up?',
			a: 'On the operator’s own server. It is backed up every day to an encrypted copy kept offsite, and a full restore from that copy was tested and worked.'
		},
		{
			q: 'How sure can I be?',
			a: 'Early days. A self-check against the government’s security manual finds most of the measures that apply in place, and the rest are tracked.'
		},
		{
			q: 'What if something goes wrong?',
			a: 'Tell the operator at once. If something went in that should not have, tell your own security officer too, and do not delete it.'
		}
	];
</script>

<PageHeader title="Can I use it?" />

<div class="bg-card border-border ds-edge rounded-lg border p-5">
	<p class="text-lg font-semibold">Yes, for public, open-source work.</p>
	<p class="text-muted-foreground mt-2 text-sm leading-relaxed">
		Never put classified information in it, whether typed, pasted, uploaded or from memory. A
		document may go in only if it is marked for public release.
	</p>
</div>

<p class="text-muted-foreground text-sm">
	This page is the operator’s own check of the app, not an official certification.
</p>

<PageSection title="Questions">
	<dl class="divide-border flex flex-col divide-y">
		{#each questions as item (item.q)}
			<div class="py-4">
				<dt class="font-medium">{item.q}</dt>
				<dd class="text-muted-foreground mt-1 text-sm leading-relaxed">{item.a}</dd>
			</div>
		{/each}
	</dl>
</PageSection>

<PageAside label="Work under way">
	<Panel title="Work under way">
		<p class="text-muted-foreground text-sm">Of 15 planned fixes, 3 are done and 4 more are in progress.</p>
		<a href="/pages/tool" class="text-primary mt-3 inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline">
			What’s done and what’s next <ArrowRight class="size-4" aria-hidden="true" />
		</a>
	</Panel>
	<Panel title="For security specialists">
		<p class="text-muted-foreground text-sm">
			Every score, every fix and every control, with the reason for each rating.
		</p>
		<a href="/pages/tool" class="text-primary mt-3 inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline">
			Open the assessment <ArrowRight class="size-4" aria-hidden="true" />
		</a>
	</Panel>
</PageAside>
