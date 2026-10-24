<script lang="ts">
	import { PageHeader } from '@poodle64/ui/page-header';
	import { PageSection } from '@poodle64/ui/page-section';
	import * as Card from '@poodle64/ui/card';
	import { TileGrid } from '@poodle64/ui/tile-grid';
	import FileText from '@lucide/svelte/icons/file-text';
	import PanelLeft from '@lucide/svelte/icons/panel-left';
	import Table from '@lucide/svelte/icons/table';
	import FlaskConical from '@lucide/svelte/icons/flask-conical';

	// The console composes the SHIPPED shell: anything wrong with it shows here
	// first, on the maintainer's own screen, before it reaches an app.
	const types = [
		{
			href: '/pages/reading',
			icon: FileText,
			title: 'Reading',
			body: 'One centred column sized for prose, and its aside beside it. The default: a route that says nothing is a reading page.'
		},
		{
			href: '/pages/panel',
			icon: PanelLeft,
			title: 'Panel',
			body: 'A second column flush against the rail, as wide as the rail, and the content left-aligned beside it. Settings, and past questions.'
		},
		{
			href: '/pages/tool',
			icon: Table,
			title: 'Tool',
			body: 'The whole frame, the content filling its height and scrolling inside itself. A library, a graph, a map.'
		}
	];
</script>

<PageHeader
	title="Design system"
	subtitle="The console for @poodle64/design-tokens and @poodle64/ui, built from them."
/>

<PageSection
	title="Page types"
	description="A route declares one; the shell owns every width, gutter and column that follows."
>
	<TileGrid tag="ul">
		{#each types as t (t.href)}
			<li><a href={t.href} class="block h-full">
				<Card.Root class="hover:border-border-strong h-full transition-colors">
					<Card.Header>
						<span
							class="bg-primary/10 text-primary mb-1 inline-flex size-9 items-center justify-center rounded-lg [&_svg]:size-5"
							aria-hidden="true"
						>
							<t.icon />
						</span>
						<Card.Title>{t.title}</Card.Title>
						<Card.Description>{t.body}</Card.Description>
					</Card.Header>
				</Card.Root>
			</a></li>
		{/each}
	</TileGrid>
</PageSection>

<PageSection title="Labs" description="Surfaces that own the whole viewport, outside the shell.">
	<a href="/lab" class="text-primary inline-flex items-center gap-2 text-sm underline-offset-4 hover:underline">
		<FlaskConical class="size-4" aria-hidden="true" />
		Shell lab
	</a>
</PageSection>
