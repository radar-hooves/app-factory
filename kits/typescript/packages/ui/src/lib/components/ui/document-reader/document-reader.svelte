<script lang="ts" module>
	/** One heading of the body, as the contents list shows it. */
	export type DocumentReaderHeading = { id: string; text: string; level: 2 | 3 };

	/** A heading's id from its text: lower case, words joined by hyphens. */
	export function slugify(text: string): string {
		return (
			text
				.toLowerCase()
				.normalize('NFKD')
				.replace(/[̀-ͯ]/g, '')
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '') || 'section'
		);
	}
</script>

<script lang="ts">
	/**
	 * A document to read: its title and trail, the body at a reading measure,
	 * and a contents list built from the body's own headings.
	 *
	 * One app had built this for four routes and read its library documents
	 * through a second shell, a DocumentDetail with the body in a box under it.
	 * DocumentDetail stays the catalogue record of a document; when there is a
	 * body to read, this is where it is read, and the record's facts go in
	 * `aside` or `meta`.
	 *
	 * The body is HTML the app has already rendered and sanitised (`html`), or
	 * markup (`children`). The package styles it with `.ds-prose` and never
	 * renders markdown itself, for the reason `.ds-prose` gives: sanitising is
	 * a security boundary the package cannot see the inputs of.
	 *
	 * The contents list is the body's `h2` and `h3`. A heading with no id is
	 * given one from its text, so an app's markdown pipeline needs no heading-id
	 * plugin. A link scrolls to its heading directly rather than through the
	 * URL fragment, because a fragment cannot find an element inside a shadow
	 * root, and this reader appears inside elements too.
	 *
	 * It centres itself and carries its own measure, so its route's `measure`
	 * only needs to leave room: `page` or wider shows the contents beside the
	 * body, and the shift from beside to above is a container query on the
	 * reader's own width, not the window's.
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import Button from '../button/button.svelte';
	import PageHeader from '../page-header/page-header.svelte';
	import type { BreadcrumbItem } from '../breadcrumbs/breadcrumbs.svelte';
	import ContentSkeleton from '../content-skeleton/content-skeleton.svelte';
	import ErrorState from '../error-state/error-state.svelte';
	import LoadingState from '../loading-state/loading-state.svelte';

	let {
		title,
		subtitle,
		breadcrumbs,
		meta,
		actions,
		html,
		children,
		contents = true,
		contentsLabel = 'On this page',
		aside,
		footer,
		loading = false,
		error = null,
		onRetry,
		ref = $bindable(null),
		class: className,
		...restProps
	}: Omit<WithElementRef<HTMLAttributes<HTMLDivElement>>, 'title' | 'children'> & {
		/** The document's title, as the page's heading. */
		title?: string;
		subtitle?: string;
		breadcrumbs?: BreadcrumbItem[];
		/** Facts about the document under its title: a date, a reading time, a status. */
		meta?: Snippet;
		actions?: Snippet;
		/** The body, rendered and sanitised by the app. */
		html?: string;
		/** The body as markup, instead of `html`. */
		children?: Snippet;
		/** Show the contents list once the body has two headings or more. */
		contents?: boolean;
		contentsLabel?: string;
		/** More for the side column, under the contents: the document's catalogue facts. */
		aside?: Snippet;
		/** After the body: what to read next, a completion control, related documents. */
		footer?: Snippet;
		/** The body is loading. With a `title` the header stands and the body is a skeleton. */
		loading?: boolean;
		error?: string | null;
		onRetry?: () => void;
	} = $props();

	let article = $state<HTMLElement | null>(null);
	let headings = $state<DocumentReaderHeading[]>([]);
	let active = $state<string | null>(null);

	const showContents = $derived(contents && headings.length >= 2);
	const side = $derived(showContents || !!aside);

	/** Give every h2 and h3 an id, and read the list. */
	function readHeadings(root: HTMLElement): DocumentReaderHeading[] {
		const scope = root.getRootNode() as Document | ShadowRoot;
		const taken = new Set<string>();
		const found: DocumentReaderHeading[] = [];
		const free = (id: string, el: HTMLElement) =>
			!taken.has(id) && [null, el].includes(scope.getElementById(id) as HTMLElement | null);
		for (const el of root.querySelectorAll<HTMLElement>('h2, h3')) {
			let id = el.id;
			if (!id || taken.has(id)) {
				const base = slugify(el.textContent ?? '');
				id = base;
				for (let n = 2; !free(id, el); n++) id = `${base}-${n}`;
				el.id = id;
			}
			taken.add(id);
			found.push({ id, text: (el.textContent ?? '').trim(), level: el.tagName === 'H2' ? 2 : 3 });
		}
		return found;
	}

	// A link that named a heading: the router scrolled before the body existed,
	// so the reader scrolls once the heading does.
	let hashSought = false;
	function seekHash(root: HTMLElement) {
		if (hashSought) return;
		const id = decodeURIComponent(window.location.hash.slice(1));
		const el = id ? root.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
		if (el) el.scrollIntoView({ block: 'start' });
		hashSought = !id || !!el;
	}

	// The body changes when `html` does, or when the app's own markup does; a
	// MutationObserver sees both. Attributes are not observed, so giving a
	// heading its id does not re-run this.
	$effect(() => {
		const root = article;
		if (!root) return;
		const read = () => {
			headings = readHeadings(root);
			seekHash(root);
		};
		read();
		const observer = new MutationObserver(read);
		observer.observe(root, { childList: true, subtree: true, characterData: true });
		return () => observer.disconnect();
	});

	// The heading being read: the last one whose top has passed a line a little
	// below the top of whatever scrolls. Scroll does not bubble but is captured
	// at the window from any scroller in the page.
	const READING_LINE = 96;
	$effect(() => {
		const list = headings;
		const root = article;
		if (!root || list.length < 2) return;
		let frame = 0;
		const update = () => {
			frame = 0;
			let current: string | null = list[0]?.id ?? null;
			for (const { id } of list) {
				const el = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
				if (el && el.getBoundingClientRect().top <= READING_LINE) current = id;
				else break;
			}
			active = current;
		};
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		update();
		window.addEventListener('scroll', onScroll, { capture: true, passive: true });
		return () => {
			window.removeEventListener('scroll', onScroll, { capture: true });
			if (frame) cancelAnimationFrame(frame);
		};
	});

	function go(event: MouseEvent, id: string) {
		const el = article?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
		if (!el) return;
		event.preventDefault();
		const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		el.scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' });
		// Move focus with the view, so the next Tab continues from the heading.
		if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
		el.focus({ preventScroll: true });
		active = id;
	}

</script>

{#snippet contentsList()}
	<nav aria-label={contentsLabel}>
		<ul class="border-border flex flex-col border-l text-sm">
			{#each headings as heading (heading.id)}
				<li>
					<a
						href={`#${heading.id}`}
						onclick={(event) => go(event, heading.id)}
						aria-current={active === heading.id ? 'location' : undefined}
						class={cn(
							'focus-visible:ring-ring/50 -ml-px block border-l-2 border-transparent py-1 pr-2 leading-snug outline-none focus-visible:ring-3',
							heading.level === 2 ? 'pl-3' : 'pl-6',
							active === heading.id
								? 'border-primary text-foreground font-medium'
								: 'text-muted-foreground hover:text-foreground'
						)}>{heading.text}</a
					>
				</li>
			{/each}
		</ul>
	</nav>
{/snippet}

<div bind:this={ref} data-slot="document-reader" class={cn('@container w-full text-base', className)} {...restProps}>
	{#if error}
		<ErrorState message={error}>
			{#snippet action()}
				{#if onRetry}
					<Button variant="outline" onclick={onRetry}>Retry</Button>
				{/if}
			{/snippet}
		</ErrorState>
	{:else if loading && !title}
		<LoadingState message="Loading the document…" />
	{:else}
		<div
			class={cn(
				'mx-auto w-full max-w-(--ds-shell-measure-prose)',
				side && '@5xl:max-w-[calc(var(--ds-shell-measure-prose)+16.5rem)]'
			)}
		>
			{#if title || breadcrumbs?.length || meta || actions}
				<PageHeader {title} {subtitle} {breadcrumbs} {meta} {actions} />
			{/if}
			{#if loading}
				<ContentSkeleton shape="prose" label="Loading the document…" />
			{:else}
				<div class="flex items-start gap-10">
					<div class="min-w-0 flex-1">
						{#if showContents}
							<details class="group bg-card border-border ds-edge mb-6 rounded-lg border @5xl:hidden">
								<summary
									class="focus-visible:ring-ring/50 flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden"
								>
									<ChevronRight
										class="text-muted-foreground size-4 transition-transform group-open:rotate-90"
										aria-hidden="true"
									/>
									{contentsLabel}
								</summary>
								<div class="px-3 pb-3">{@render contentsList()}</div>
							</details>
						{/if}
						<article
							bind:this={article}
							class="ds-prose ds-measure [&_:is(h2,h3)]:scroll-mt-4 [&_:is(h2,h3)]:outline-none"
							data-measure="prose"
						>
							{#if html !== undefined}
								{@html html}
							{:else}
								{@render children?.()}
							{/if}
						</article>
						{#if aside}
							<div class="mt-10 @5xl:hidden">{@render aside()}</div>
						{/if}
						{#if footer}
							<div class="border-border mt-12 border-t pt-6">{@render footer()}</div>
						{/if}
					</div>
					{#if side}
						<aside
							class="sticky top-4 hidden max-h-[calc(100dvh-6rem)] w-56 shrink-0 flex-col gap-8 overflow-y-auto @5xl:flex"
						>
							{#if showContents}
								<div class="flex flex-col gap-2">
									<p class="text-muted-foreground text-2xs tracking-eyebrow font-medium uppercase" aria-hidden="true">
										{contentsLabel}
									</p>
									{@render contentsList()}
								</div>
							{/if}
							{@render aside?.()}
						</aside>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
