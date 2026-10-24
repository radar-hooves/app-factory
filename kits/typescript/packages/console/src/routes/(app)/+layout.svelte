<script lang="ts">
	import { page } from '$app/state';
	import { AppShell, type NavGroup } from '@poodle64/ui/app-shell';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import FileText from '@lucide/svelte/icons/file-text';
	import PanelLeft from '@lucide/svelte/icons/panel-left';
	import Table from '@lucide/svelte/icons/table';

	// The console's own pages, composed the way a stamped app's frame composes
	// them: one shell, and each route says what it is in its load data. /lab and
	// /chat stand outside, each owning the whole viewport.
	const nav: NavGroup[] = [
		{ items: [{ label: 'Overview', href: '/', icon: BookOpen, exact: true }] },
		{
			heading: 'Page types',
			items: [
				{ label: 'Reading', href: '/pages/reading', icon: FileText },
				{ label: 'Panel', href: '/pages/panel', icon: PanelLeft },
				{ label: 'Tool', href: '/pages/tool', icon: Table }
			]
		}
	];

	let { children } = $props();
</script>

<AppShell
	{nav}
	currentPath={page.url.pathname}
	brandTitle="Design system"
	homeHref="/"
	pageType={page.data.pageType}
	title={page.data.title}
>
	{@render children()}
</AppShell>
