<script lang="ts">
	import { AppShell } from '@poodle64/ui/app-shell';
	import { PageHeader } from '@poodle64/ui/page-header';
	import * as Card from '@poodle64/ui/card';
	import { FlaskConical, Palette, Component, BookOpen } from '@lucide/svelte';

	// The console composes the SHIPPED shell. Anything wrong with AppShell shows
	// up here first, on the maintainer's own screen, before it reaches an app.
	const nav = [
		{ label: 'Overview', href: '/', icon: BookOpen, exact: true },
		{ label: 'Shell lab', href: '/lab', icon: FlaskConical },
		{ label: 'Palette', href: '/palette', icon: Palette },
		{ label: 'Components', href: '/components', icon: Component }
	];

	const cards = [
		{
			href: '/lab',
			icon: FlaskConical,
			title: 'Shell lab',
			body: 'Chrome shapes that do not exist yet — top bar, rail, page header, content measure — across every app profile and viewport, with the geometry measured as you go.'
		},
		{
			href: '/palette',
			icon: Palette,
			title: 'Palette',
			body: 'Every palette in tokens/palettes.json projected through the shared neutral ladder, in both themes.'
		},
		{
			href: '/components',
			icon: Component,
			title: 'Components',
			body: 'What @poodle64/ui ships, composed the way an app is meant to compose it.'
		}
	];
</script>

<AppShell {nav} currentPath="/" brandTitle="Design system" measure="wide" homeHref="/">
	<PageHeader
		title="Design system"
		subtitle="The console for @poodle64/design-tokens and @poodle64/ui, built from them."
	/>

	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
		{#each cards as c (c.href)}
			<a href={c.href} class="block">
				<Card.Root class="h-full transition-colors hover:border-border-strong">
					<Card.Header>
						<span
							class="bg-primary/10 text-primary mb-1 inline-flex size-9 items-center justify-center rounded-lg [&_svg]:size-5"
							aria-hidden="true"
						>
							<c.icon />
						</span>
						<Card.Title>{c.title}</Card.Title>
						<Card.Description>{c.body}</Card.Description>
					</Card.Header>
				</Card.Root>
			</a>
		{/each}
	</div>
</AppShell>
