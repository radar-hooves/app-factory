<!--
  Where the next question looks, as one control: the choice's title on a quiet
  button, and a list over the composer to change it, searchable once it is
  long. It replaced a chip per collection, which stood taller than the box for
  a person holding 27 (caspo#177).

  The WAI-ARIA listbox pattern: the button says what it opens, the arrows move
  through the choices, Enter takes one and Escape hands focus back. The list
  is placed against the composer's box rather than this button, so it keeps
  the box's width at 390, and opens towards whichever side has more room
  inside whatever clips it: up from a docked box, either way from a centred
  one.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { ChatCopy } from '../../copy';
	import { titleOf, type CollectionChoice } from './choices';

	/** From this many choices a search field heads the list. */
	const SEARCH_FROM = 8;
	/** The list's tallest, in px, before it scrolls. */
	const TALLEST = 320;

	interface Props {
		collections: CollectionChoice[];
		/** The chosen collection's name; undefined is all of them. */
		collection?: string;
		words: ChatCopy;
		/** The composer's box, which the list is placed against. */
		anchor: HTMLElement | null;
		onchoose: (collection: string | undefined) => void;
	}

	let { collections, collection, words, anchor, onchoose }: Props = $props();

	const id = $props.id();
	const listId = `${id}-list`;

	let open = $state(false);
	let query = $state('');
	let active = $state(0);
	let place = $state({ up: true, left: 0, width: 0, height: TALLEST });

	let root = $state<HTMLElement | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	let search = $state<HTMLInputElement | null>(null);
	let list = $state<HTMLUListElement | null>(null);

	const searchable = $derived(collections.length >= SEARCH_FROM);
	const current = $derived.by(() => {
		const chosen = collections.find((c) => c.name === collection);
		return chosen ? titleOf(chosen) : words.allCollections;
	});

	interface Option {
		name: string | undefined;
		title: string;
		description?: string;
	}

	// While a search is typed, "all of them" steps aside so Enter takes the
	// first match rather than the reset.
	const options = $derived.by((): Option[] => {
		const each = collections.map((c) => ({
			name: c.name,
			title: titleOf(c),
			description: c.description?.trim() || undefined
		}));
		const typed = query.trim().toLocaleLowerCase();
		if (!typed) return [{ name: undefined, title: words.allCollections }, ...each];
		return each.filter((o) =>
			[o.title, o.name, o.description ?? ''].some((text) => text.toLocaleLowerCase().includes(typed))
		);
	});
	const activeId = $derived(options[active] ? `${listId}-${active}` : undefined);

	/** How far the anchor can open each way inside whatever clips it. */
	function room(el: HTMLElement) {
		const box = el.getBoundingClientRect();
		let top = 0;
		let bottom = window.innerHeight;
		for (let parent = el.parentElement; parent; parent = parent.parentElement) {
			if (getComputedStyle(parent).overflowY === 'visible') continue;
			const clip = parent.getBoundingClientRect();
			top = Math.max(top, clip.top);
			bottom = Math.min(bottom, clip.bottom);
		}
		return { box, above: box.top - top, below: bottom - box.bottom };
	}

	async function show() {
		if (anchor && trigger) {
			const { box, above, below } = room(anchor);
			const at = trigger.getBoundingClientRect();
			const width = Math.min(box.width - 16, 352);
			const up = above >= below;
			place = {
				up,
				width,
				left: Math.max(8, Math.min(at.left - box.left - anchor.clientLeft, box.width - width - 8)),
				height: Math.max(160, Math.min(TALLEST, (up ? above : below) - 12))
			};
		}
		query = '';
		active = Math.max(0, options.findIndex((o) => o.name === collection));
		open = true;
		await tick();
		(search ?? list)?.focus();
		reveal();
	}

	function close(refocus: boolean) {
		open = false;
		if (refocus) trigger?.focus();
	}

	function choose(option: Option | undefined) {
		if (!option) return;
		open = false;
		onchoose(option.name);
	}

	/** The active option in view, scrolling the list alone: `scrollIntoView`
	 *  would scroll a centred stage or the page under it as well. */
	function reveal() {
		const option = activeId ? document.getElementById(activeId) : null;
		if (!option || !list) return;
		const bottom = option.offsetTop + option.offsetHeight;
		if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
		else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
	}

	function move(to: number) {
		active = Math.max(0, Math.min(to, options.length - 1));
		reveal();
	}

	function key(event: KeyboardEvent) {
		// Home and End move the caret in a search field, so only the bare list takes them.
		const inList = event.currentTarget === list;
		if (event.key === 'ArrowDown') move(active + 1);
		else if (event.key === 'ArrowUp') move(active - 1);
		else if (event.key === 'Home' && inList) move(0);
		else if (event.key === 'End' && inList) move(options.length - 1);
		else if (event.key === 'Enter') choose(options[active]);
		else if (event.key === 'Escape') {
			// Stopped here: a sheet or a page around the composer listens for
			// Escape too, and this one was only ever closing the list.
			event.stopPropagation();
			close(true);
		} else if (event.key === 'Tab') {
			close(false);
			return;
		} else return;
		event.preventDefault();
	}

	function triggerKey(event: KeyboardEvent) {
		if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !open) {
			event.preventDefault();
			void show();
		}
	}

	// A soft keyboard that resizes the layout viewport (Firefox on Android)
	// fires `resize` the moment the search field takes focus; only a change of
	// width moves the box the list was placed against.
	$effect(() => {
		if (!open) return;
		const width = window.innerWidth;
		const outside = (event: PointerEvent) => {
			if (!root?.contains(event.target as Node)) close(false);
		};
		const resized = () => {
			if (window.innerWidth !== width) close(false);
		};
		document.addEventListener('pointerdown', outside, true);
		window.addEventListener('resize', resized);
		return () => {
			document.removeEventListener('pointerdown', outside, true);
			window.removeEventListener('resize', resized);
		};
	});
</script>

<div
	class="ds-lib-scope-picker"
	bind:this={root}
	onfocusout={(event) => {
		if (open && !root?.contains(event.relatedTarget as Node | null)) close(false);
	}}
>
	<button
		bind:this={trigger}
		type="button"
		class="ds-lib-scope-trigger"
		class:is-narrowed={collection !== undefined}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls={open ? listId : undefined}
		aria-label="{words.collectionsLabel}: {current}"
		onclick={() => (open ? close(false) : void show())}
		onkeydown={triggerKey}
	>
		<span class="ds-lib-scope-current">{current}</span>
		<ChevronDownIcon size={14} />
	</button>

	{#if open}
		<div
			class="ds-lib-scope-pop"
			class:is-up={place.up}
			style="left: {place.left}px; width: {place.width}px; max-height: {place.height}px"
		>
			{#if searchable}
				<input
					bind:this={search}
					bind:value={query}
					oninput={() => (active = 0)}
					onkeydown={key}
					type="search"
					role="combobox"
					aria-expanded="true"
					aria-controls={listId}
					aria-autocomplete="list"
					aria-activedescendant={activeId}
					aria-label={words.collectionsLabel}
					placeholder={words.findCollection}
					autocomplete="off"
					class="ds-lib-scope-search"
				/>
			{/if}
			<!-- Focus stays in the field or on the list: a pressed option would
			     otherwise take it, and the active one is announced by reference. -->
			<ul
				bind:this={list}
				id={listId}
				role="listbox"
				aria-label={words.collectionsLabel}
				tabindex={searchable ? -1 : 0}
				aria-activedescendant={searchable ? undefined : activeId}
				onkeydown={searchable ? undefined : key}
				onmousedown={(event) => event.preventDefault()}
				class="ds-lib-scope-list"
			>
				{#each options as option, index (option.name ?? '')}
					<!-- The keyboard drives the list from the field or the listbox
					     itself, by reference; an option never takes focus. -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						id="{listId}-{index}"
						role="option"
						tabindex="-1"
						aria-selected={option.name === collection}
						class="ds-lib-scope-option"
						class:is-active={index === active}
						onclick={() => choose(option)}
						onpointermove={() => (active = index)}
					>
						<span class="ds-lib-scope-option-text">
							<span class="ds-lib-scope-option-title">{option.title}</span>
							{#if option.description}
								<span class="ds-lib-scope-option-description">{option.description}</span>
							{/if}
						</span>
						{#if option.name === collection}<CheckIcon size={14} />{/if}
					</li>
				{/each}
			</ul>
			{#if options.length === 0}
				<p class="ds-lib-scope-none" role="status">{words.noCollectionMatch}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Not positioned: the list is placed against the composer's box. */
	.ds-lib-scope-picker {
		display: flex;
		min-width: 0;
	}

	.ds-lib-scope-trigger {
		display: flex;
		min-width: 0;
		max-width: 16rem;
		align-items: center;
		gap: 0.25rem;
		border: 1px solid transparent;
		border-radius: var(--ds-radius-full);
		background: none;
		padding: 0.25rem 0.5rem 0.25rem 0.625rem;
		color: var(--ds-color-muted-foreground);
		font: inherit;
		font-size: var(--ds-text-2xs);
		cursor: pointer;
		transition:
			color 150ms ease,
			background-color 150ms ease;
	}

	.ds-lib-scope-trigger:hover,
	.ds-lib-scope-trigger[aria-expanded='true'] {
		background: var(--ds-color-surface-2);
		color: var(--ds-color-foreground);
	}

	.ds-lib-scope-trigger.is-narrowed {
		border-color: color-mix(in oklab, var(--ds-color-primary) 40%, transparent);
		background: color-mix(in oklab, var(--ds-color-primary) 15%, transparent);
		color: var(--ds-color-foreground);
	}

	.ds-lib-scope-trigger:focus-visible,
	.ds-lib-scope-list:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-scope-current {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ds-lib-scope-pop {
		position: absolute;
		z-index: 20;
		top: calc(100% + 0.375rem);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--ds-color-border);
		border-radius: var(--ds-radius-lg);
		background: var(--ds-color-surface-1);
		box-shadow: 0 12px 28px rgb(0 0 0 / 0.2);
	}

	.ds-lib-scope-pop.is-up {
		top: auto;
		bottom: calc(100% + 0.375rem);
	}

	.ds-lib-scope-search {
		flex: none;
		border: 0;
		border-bottom: 1px solid var(--ds-color-border);
		background: transparent;
		padding: 0.625rem 0.75rem;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: 0.875rem;
		outline: none;
	}

	.ds-lib-scope-search::placeholder {
		color: var(--ds-color-muted-foreground);
	}

	/* Positioned: each option's offset is measured from it. */
	.ds-lib-scope-list {
		position: relative;
		min-height: 0;
		flex: 1;
		overflow-y: auto;
		margin: 0;
		padding: 0.25rem;
		list-style: none;
		outline: none;
	}

	/* 44px: an option is a thumb's target on a phone. */
	.ds-lib-scope-option {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.5rem;
		border-radius: var(--ds-radius-md);
		padding: 0.375rem 0.625rem;
		color: var(--ds-color-foreground);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.ds-lib-scope-option.is-active {
		background: var(--ds-color-surface-2);
	}

	.ds-lib-scope-option-text {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
	}

	.ds-lib-scope-option-title,
	.ds-lib-scope-option-description {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ds-lib-scope-option-description {
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-scope-none {
		margin: 0;
		padding: 0.75rem;
		color: var(--ds-color-muted-foreground);
		font-size: 0.875rem;
	}
</style>
