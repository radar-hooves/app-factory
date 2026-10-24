<!--
  Where the next question looks, as one control: the chip names the scope, and
  a picker over the composer changes it. A person thinks in subjects, so the
  picker narrows in two steps: a subject on the left, what is in it on the
  right ("All of <subject>" first). Typing replaces both with one list of
  matches, each with its subject beside it. Under 48rem it is a sheet from the
  bottom that shows one step at a time.

  Pointing at a subject only browses it; a row on the right (or a loose
  collection, or "everything") is what sets the scope, and setting it closes
  the picker. Every name wraps: nothing here truncates (operator, 24/10/2026).

  Focus stays in the search field or on a list, and the active row is named by
  `aria-activedescendant`; a row never takes focus. Tab moves search, subjects,
  contents.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { fill, type ChatCopy } from '../../copy';
	import { labelOf, titleOf, type CollectionChoice, type CollectionGroup } from './choices';

	/** From this many choices a search field heads the picker. */
	const SEARCH_FROM = 8;
	/** The popover's tallest, in px, before its panes scroll. */
	const TALLEST = 440;
	/** The popover's widest, in px (44rem). */
	const WIDEST = 704;
	/** The popover of a list with no subjects, in px. */
	const NARROWEST = 352;

	interface Props {
		collections: CollectionChoice[];
		/** The chosen collection's name; undefined is all of them. */
		collection?: string;
		/** The chosen group's name: all of that group's collections. */
		group?: string;
		words: ChatCopy;
		/** The composer's box, which the popover is placed against. */
		anchor: HTMLElement | null;
		/** Exactly one of the two is set, or neither for all of them. */
		onchoose: (pick: { collection?: string; group?: string }) => void;
	}

	let { collections, collection, group, words, anchor, onchoose }: Props = $props();

	const id = $props.id();
	const popId = `${id}-pop`;
	const subjectsId = `${id}-subjects`;
	const contentsId = `${id}-contents`;
	const flatId = `${id}-flat`;

	let open = $state(false);
	let query = $state('');
	/** A phone: a sheet, one step at a time. */
	let narrow = $state(false);
	/** On a phone, which step is showing. */
	let step = $state<'subjects' | 'contents'>('subjects');
	/** The subject whose contents show on the right. */
	let browsed = $state<string | undefined>(undefined);
	let activeSubject = $state(0);
	let activeContent = $state(0);
	let activeFlat = $state(0);
	/** Which part holds focus: only that part's active row is lit, so a row lit
	 *  by an arrow is never read as the chosen one (second read, 24/10/2026). */
	let focused = $state<'search' | 'subjects' | 'contents' | 'flat' | null>(null);
	let place = $state({ up: true, left: 0, width: WIDEST, height: TALLEST });

	let root = $state<HTMLElement | null>(null);
	/** What opens: inside `root` on a desktop, in `<body>` on a phone. */
	let layer = $state<HTMLElement | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	let search = $state<HTMLInputElement | null>(null);
	let subjectList = $state<HTMLUListElement | null>(null);
	let contentList = $state<HTMLUListElement | null>(null);
	let flatList = $state<HTMLUListElement | null>(null);

	const searchable = $derived(collections.length >= SEARCH_FROM);
	const current = $derived.by(() => {
		const chosen = collections.find((c) => c.name === collection);
		if (chosen) return labelOf(chosen);
		const set = collections.find((c) => c.group?.name === group)?.group;
		return set ? set.title : words.allCollections;
	});

	/** One row: everything, a subject, a subject taken whole, or one collection. */
	interface Option {
		key: string;
		kind: 'all' | 'subject' | 'group' | 'collection';
		name: string | undefined;
		label: string;
		/** The accessible name, which carries what the sight does (count, subject). */
		aria: string;
		/** The full title, for the row's tooltip. */
		title: string;
		/** In a flat list, the subject the collection sits in. */
		under?: string;
		count?: number;
	}

	interface Subject {
		group: CollectionGroup;
		members: CollectionChoice[];
	}

	const typed = $derived(query.trim().toLocaleLowerCase());

	// Subjects in the order each first appears; what has none follows, as rows
	// of the subjects pane that set the scope themselves.
	const shelves = $derived.by(() => {
		const subjects = new Map<string, Subject>();
		const loose: CollectionChoice[] = [];
		for (const c of collections) {
			if (!c.group) loose.push(c);
			else {
				const entry = subjects.get(c.group.name) ?? { group: c.group, members: [] };
				entry.members.push(c);
				subjects.set(c.group.name, entry);
			}
		}
		return { subjects: [...subjects.values()], loose };
	});
	const grouped = $derived(shelves.subjects.length > 0);
	/** One list of rows rather than two panes: a search, or nothing to group by. */
	const flat = $derived(typed !== '' || !grouped);

	const everything = $derived<Option>({
		key: 'all',
		kind: 'all',
		name: undefined,
		label: words.allCollections,
		aria: words.allCollections,
		title: words.allCollections
	});
	const collectionOption = (c: CollectionChoice, withSubject = false): Option => ({
		key: `c:${c.name}`,
		kind: 'collection',
		name: c.name,
		label: labelOf(c),
		aria:
			withSubject && c.group
				? fill(words.inSubject, { collection: labelOf(c), subject: c.group.title })
				: labelOf(c),
		title: titleOf(c),
		under: withSubject ? c.group?.title : undefined
	});
	const wholeOption = (g: CollectionGroup): Option => {
		const label = fill(words.allOfSubject, { subject: g.title });
		return { key: `g:${g.name}`, kind: 'group', name: g.name, label, aria: label, title: label };
	};
	const subjectOption = (s: Subject): Option => ({
		key: `s:${s.group.name}`,
		kind: 'subject',
		name: s.group.name,
		label: s.group.title,
		aria: fill(words.subjectRow, { subject: s.group.title, count: s.members.length }),
		title: s.group.title,
		count: s.members.length
	});

	const matches = (text: string, ...texts: (string | undefined)[]) =>
		texts.some((t) => t?.toLocaleLowerCase().includes(text));

	/** Left pane: everything, each subject, then the loose collections. */
	const subjectRows = $derived<Option[]>([
		everything,
		...shelves.subjects.map(subjectOption),
		...shelves.loose.map((c) => collectionOption(c))
	]);

	/** Where the loose collections begin in the subjects pane, which a rule sets apart. */
	const firstLoose = $derived(shelves.loose.length ? 1 + shelves.subjects.length : -1);

	const browsedSubject = $derived(shelves.subjects.find((s) => s.group.name === browsed));

	/** Right pane: the browsed subject taken whole, then what is in it. */
	const contentRows = $derived<Option[]>(
		browsedSubject
			? [wholeOption(browsedSubject.group), ...browsedSubject.members.map((c) => collectionOption(c))]
			: []
	);

	// Typing: a subject whose name matches offers itself whole, then every
	// collection that matches by short title, full title, name or subject.
	// "Everything" steps aside so Enter takes the first match, not the reset.
	const flatRows = $derived.by((): Option[] => {
		if (!typed) {
			return [everything, ...collections.map((c) => collectionOption(c))];
		}
		const rows: Option[] = [];
		for (const s of shelves.subjects) {
			if (matches(typed, s.group.title, s.group.name)) rows.push(wholeOption(s.group));
		}
		for (const c of collections) {
			if (matches(typed, c.shortTitle, titleOf(c), c.name, c.group?.title, c.group?.name)) {
				rows.push(collectionOption(c, true));
			}
		}
		return rows;
	});

	const isChosen = (o: Option) =>
		o.kind === 'all'
			? collection === undefined && group === undefined
			: o.kind === 'subject'
				? false
				: o.name === (o.kind === 'group' ? group : collection);
	const isBrowsed = (o: Option) => o.kind === 'subject' && o.name === browsed;

	const lit = (list: 'subjects' | 'contents' | 'flat') =>
		focused === list || (list === 'flat' && focused === 'search');

	const idOf = (list: string, index: number) => `${list}-${index}`;
	const activeSubjectId = $derived(subjectRows[activeSubject] ? idOf(subjectsId, activeSubject) : undefined);
	const activeContentId = $derived(contentRows[activeContent] ? idOf(contentsId, activeContent) : undefined);
	const activeFlatId = $derived(flatRows[activeFlat] ? idOf(flatId, activeFlat) : undefined);

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

	/** A sheet is fixed to the screen, and a fixed element inside a transformed
	 *  ancestor (the composer lifts with the keyboard) is fixed to that instead:
	 *  so on a phone the layer moves to `<body>`. */
	function lift(node: HTMLElement, toBody: boolean) {
		if (!toBody) return;
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}

	const inside = (target: Node | null) =>
		Boolean(target && (root?.contains(target) || layer?.contains(target)));

	/** Where the chosen scope sits: its subject's name, if it has one. */
	function chosenSubject(): string | undefined {
		if (group !== undefined) return group;
		return collections.find((c) => c.name === collection)?.group?.name;
	}

	async function show() {
		if (anchor && trigger && !narrow) {
			const { box, above, below } = room(anchor);
			const at = trigger.getBoundingClientRect();
			const wide = grouped ? WIDEST : NARROWEST;
			const width = Math.min(box.width - 16, wide);
			const up = above >= below;
			place = {
				up,
				width,
				left: Math.max(8, Math.min(at.left - box.left - anchor.clientLeft, box.width - width - 8)),
				height: Math.max(200, Math.min(TALLEST, (up ? above : below) - 12))
			};
		}
		query = '';
		step = 'subjects';
		// Reopening lands on the chosen scope's subject; with none chosen, on the
		// last one browsed, else the first.
		const inside = chosenSubject();
		browsed = inside ?? browsed ?? shelves.subjects[0]?.group.name;
		const at = inside ? subjectRows.findIndex((o) => o.name === inside && o.kind === 'subject') : -1;
		const loose = collection ? subjectRows.findIndex((o) => o.kind === 'collection' && o.name === collection) : -1;
		activeSubject = Math.max(0, at >= 0 ? at : loose);
		activeContent = Math.max(0, contentRows.findIndex(isChosen));
		activeFlat = Math.max(0, flatRows.findIndex(isChosen));
		focused = null;
		open = true;
		await tick();
		(narrow || !searchable ? (flat ? flatList : subjectList) : search)?.focus();
		reveal(subjectList, activeSubjectId);
		reveal(contentList, activeContentId);
		reveal(flatList, activeFlatId);
	}

	function close(refocus: boolean) {
		open = false;
		if (refocus) trigger?.focus();
	}

	function choose(option: Option | undefined) {
		if (!option || option.kind === 'subject') return;
		open = false;
		onchoose(
			option.kind === 'group'
				? { group: option.name }
				: option.kind === 'collection'
					? { collection: option.name }
					: {}
		);
	}

	/** Browse a subject: its contents show, the scope is untouched. */
	function browse(name: string | undefined) {
		if (name === undefined || name === browsed) return;
		browsed = name;
		activeContent = 0;
	}

	/** Go into a subject: focus moves to its contents (a phone's next step). */
	async function drill(name: string | undefined) {
		if (name === undefined) return;
		browse(name);
		activeContent = Math.max(0, contentRows.findIndex(isChosen));
		if (narrow) step = 'contents';
		await tick();
		contentList?.focus();
		reveal(contentList, activeContentId);
	}

	async function back() {
		step = 'subjects';
		await tick();
		subjectList?.focus();
		reveal(subjectList, activeSubjectId);
	}

	/** A row on the subjects pane: a subject browses (a phone drills), the rest set the scope. */
	function pick(option: Option, index: number) {
		activeSubject = index;
		if (option.kind === 'subject') {
			if (narrow) void drill(option.name);
			else browse(option.name);
		} else choose(option);
	}

	/** The active option in view, scrolling its list alone: `scrollIntoView`
	 *  would scroll a centred stage or the page under it as well. */
	function reveal(list: HTMLElement | null, optionId: string | undefined) {
		const option = optionId ? document.getElementById(optionId) : null;
		if (!option || !list) return;
		const bottom = option.offsetTop + option.offsetHeight;
		if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
		else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
	}

	const clamp = (to: number, rows: Option[]) => Math.max(0, Math.min(to, rows.length - 1));

	function moveSubjects(to: number) {
		activeSubject = clamp(to, subjectRows);
		const row = subjectRows[activeSubject];
		if (row?.kind === 'subject') browse(row.name);
		reveal(subjectList, activeSubjectId);
	}
	function moveContents(to: number) {
		activeContent = clamp(to, contentRows);
		reveal(contentList, activeContentId);
	}
	function moveFlat(to: number) {
		activeFlat = clamp(to, flatRows);
		reveal(flatList, activeFlatId);
	}

	/** Arrows, Home, End and Enter on one list. Home and End move the caret in
	 *  a search field, so only a bare list takes them. */
	function navigate(
		event: KeyboardEvent,
		at: number,
		move: (to: number) => void,
		rows: Option[],
		enter: () => void
	) {
		const inField = event.currentTarget === search;
		if (event.key === 'ArrowDown') move(at + 1);
		else if (event.key === 'ArrowUp') move(at - 1);
		else if (event.key === 'Home' && !inField) move(0);
		else if (event.key === 'End' && !inField) move(rows.length - 1);
		else if (event.key === 'Enter') enter();
		else return false;
		event.preventDefault();
		return true;
	}

	function subjectsKey(event: KeyboardEvent) {
		const row = subjectRows[activeSubject];
		if (navigate(event, activeSubject, moveSubjects, subjectRows, () => pickKey(row))) return;
		if (event.key === 'ArrowRight' && row?.kind === 'subject') {
			event.preventDefault();
			void drill(row.name);
		}
	}
	function pickKey(row: Option | undefined) {
		if (!row) return;
		if (row.kind === 'subject') void drill(row.name);
		else choose(row);
	}
	function contentsKey(event: KeyboardEvent) {
		if (navigate(event, activeContent, moveContents, contentRows, () => choose(contentRows[activeContent])))
			return;
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			if (narrow) void back();
			else subjectList?.focus();
		}
	}
	function flatKey(event: KeyboardEvent) {
		navigate(event, activeFlat, moveFlat, flatRows, () => choose(flatRows[activeFlat]));
	}
	/** The field drives the flat list while one shows; over the panes, Down goes into them. */
	function searchKey(event: KeyboardEvent) {
		if (flat) return flatKey(event);
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			subjectList?.focus();
		}
	}

	function popKey(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		// Stopped here: a sheet or a page around the composer listens for
		// Escape too, and this one was only ever closing the picker.
		event.stopPropagation();
		event.preventDefault();
		close(true);
	}

	function triggerKey(event: KeyboardEvent) {
		if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !open) {
			event.preventDefault();
			void show();
		}
	}

	// A phone is under 48rem, the app shell's own break.
	$effect(() => {
		const phone = window.matchMedia?.('(max-width: 47.99rem)');
		if (!phone) return;
		narrow = phone.matches;
		const changed = (event: MediaQueryListEvent) => (narrow = event.matches);
		phone.addEventListener?.('change', changed);
		return () => phone.removeEventListener?.('change', changed);
	});

	// A soft keyboard that resizes the layout viewport (Firefox on Android)
	// fires `resize` the moment the search field takes focus; only a change of
	// width moves the box the popover was placed against.
	$effect(() => {
		if (!open) return;
		const width = window.innerWidth;
		const outside = (event: PointerEvent) => {
			if (!inside(event.target as Node)) close(false);
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

{#snippet row(option: Option, index: number, list: string, active: number, shown: boolean, chosen: boolean, take: () => void, hover: () => void)}
	<!-- The keyboard drives a list by reference; a row never takes focus. -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<li
		id={idOf(list, index)}
		role="option"
		tabindex="-1"
		title={option.title}
		aria-label={option.aria}
		aria-selected={chosen}
		aria-current={isBrowsed(option) ? 'true' : undefined}
		class="ds-lib-scope-option"
		class:is-whole={option.kind === 'group'}
		class:is-browsed={isBrowsed(option)}
		class:is-active={shown && index === active}
		class:is-first-loose={option.kind === 'collection' && list === subjectsId && index === firstLoose}
		onclick={take}
		onpointermove={hover}
	>
		<span class="ds-lib-scope-option-text">
			<span class="ds-lib-scope-option-title">{option.label}</span>
			{#if option.under}<span class="ds-lib-scope-option-under">{option.under}</span>{/if}
		</span>
		{#if option.kind === 'subject'}
			<span class="ds-lib-scope-count">{option.count}</span>
			{#if narrow}<ChevronRightIcon size={16} />{/if}
		{:else if chosen}
			<CheckIcon size={16} />
		{/if}
	</li>
{/snippet}

<div
	class="ds-lib-scope-picker"
	bind:this={root}
	onfocusout={(event) => {
		const to = event.relatedTarget as Node | null;
		if (open && to && !inside(to)) close(false);
	}}
>
	<button
		bind:this={trigger}
		type="button"
		class="ds-lib-scope-trigger"
		class:is-narrowed={collection !== undefined || group !== undefined}
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-controls={open ? popId : undefined}
		aria-label="{words.collectionsLabel}: {current}"
		onclick={() => (open ? close(false) : void show())}
		onkeydown={triggerKey}
	>
		<span class="ds-lib-scope-current">{current}</span>
		<ChevronDownIcon size={14} />
	</button>

	{#if open}
		<div class="ds-lib-scope-layer" bind:this={layer} use:lift={narrow}>
			{#if narrow}
				<button
					type="button"
					class="ds-lib-scope-scrim"
					tabindex="-1"
					aria-hidden="true"
					onclick={() => close(true)}
				></button>
			{/if}
			<!-- Escape is handled here for whatever inside has focus. -->
			<div
				id={popId}
				role="dialog"
				tabindex="-1"
				aria-label={words.collectionsLabel}
				class="ds-lib-scope-pop"
				class:is-sheet={narrow}
				class:is-up={place.up && !narrow}
				class:is-flat={flat}
				style={narrow ? undefined : `left: ${place.left}px; width: ${place.width}px; max-height: ${place.height}px`}
				onkeydown={popKey}
				onfocusin={(event) => {
					const at = event.target;
					focused =
						at === search
							? 'search'
							: at === subjectList
								? 'subjects'
								: at === contentList
									? 'contents'
									: at === flatList
										? 'flat'
										: null;
				}}
				onfocusout={() => (focused = null)}
			>
				{#if narrow && step === 'contents' && !flat}
					<div class="ds-lib-scope-head">
						<button
							type="button"
							class="ds-lib-scope-back"
							aria-label={fill(words.backToSubjects, { subject: browsedSubject?.group.title ?? '' })}
							onclick={() => void back()}
						>
							<ChevronLeftIcon size={18} />
							<span>{browsedSubject?.group.title}</span>
						</button>
					</div>
				{:else if searchable}
					<div class="ds-lib-scope-find">
						<SearchIcon size={16} />
						<input
							bind:this={search}
							bind:value={query}
							oninput={() => (activeFlat = 0)}
							onkeydown={searchKey}
							type="search"
							role="combobox"
							aria-expanded="true"
							aria-controls={flat ? flatId : subjectsId}
							aria-autocomplete="list"
							aria-activedescendant={flat ? activeFlatId : undefined}
							aria-label={words.collectionsLabel}
							placeholder={words.findCollection}
							autocomplete="off"
							class="ds-lib-scope-search"
						/>
					</div>
				{/if}

				<div class="ds-lib-scope-panes">
					{#if flat}
						<!-- Focus stays in the field or on the list; a pressed row would take it. -->
						<ul
							bind:this={flatList}
							id={flatId}
							role="listbox"
							aria-label={words.collectionsLabel}
							tabindex={searchable ? -1 : 0}
							aria-activedescendant={searchable ? undefined : activeFlatId}
							onkeydown={searchable ? undefined : flatKey}
							onmousedown={(event) => event.preventDefault()}
							class="ds-lib-scope-list"
						>
							{#each flatRows as option, index (option.key)}
								{@render row(option, index, flatId, activeFlat, lit('flat'), isChosen(option), () => choose(option), () => (activeFlat = index))}
							{/each}
						</ul>
						{#if flatRows.length === 0}
							<p class="ds-lib-scope-none" role="status">{words.noCollectionMatch}</p>
						{/if}
					{:else}
						{#if !narrow || step === 'subjects'}
							<ul
								bind:this={subjectList}
								id={subjectsId}
								role="listbox"
								aria-label={words.subjectsLabel}
								tabindex="0"
								aria-activedescendant={activeSubjectId}
								onkeydown={subjectsKey}
								onmousedown={(event) => event.preventDefault()}
								class="ds-lib-scope-list ds-lib-scope-subjects"
							>
								{#each subjectRows as option, index (option.key)}
									{@render row(
										option,
										index,
										subjectsId,
										activeSubject,
										lit('subjects'),
										isChosen(option),
										() => pick(option, index),
										() => {
											activeSubject = index;
											if (!narrow && option.kind === 'subject') browse(option.name);
										}
									)}
								{/each}
							</ul>
						{/if}
						{#if !narrow || step === 'contents'}
							<ul
								bind:this={contentList}
								id={contentsId}
								role="listbox"
								aria-label={browsedSubject?.group.title ?? words.collectionsLabel}
								tabindex="0"
								aria-activedescendant={activeContentId}
								onkeydown={contentsKey}
								onmousedown={(event) => event.preventDefault()}
								class="ds-lib-scope-list ds-lib-scope-contents"
							>
								{#each contentRows as option, index (option.key)}
									{@render row(option, index, contentsId, activeContent, lit('contents'), isChosen(option), () => choose(option), () => (activeContent = index))}
								{/each}
							</ul>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Not positioned: the popover is placed against the composer's box. */
	.ds-lib-scope-picker {
		display: flex;
		min-width: 0;
	}

	/* The chip names the scope in full: a long name wraps to a second line
	   rather than being cut. */
	.ds-lib-scope-trigger {
		display: flex;
		min-width: 0;
		max-width: 16rem;
		align-items: center;
		gap: 0.25rem;
		border: 1px solid transparent;
		border-radius: var(--ds-radius-full);
		background: none;
		min-height: 2.75rem;
		padding: 0.25rem var(--ds-spacing-sm) 0.25rem 0.75rem;
		color: var(--ds-color-muted-foreground);
		font: inherit;
		font-size: 0.875rem;
		line-height: 1.25;
		text-align: left;
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
	.ds-lib-scope-list:focus-visible,
	.ds-lib-scope-back:focus-visible {
		outline: 2px solid var(--ds-color-ring);
		outline-offset: 2px;
	}

	.ds-lib-scope-current {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.ds-lib-scope-trigger :global(svg) {
		flex: none;
	}

	/* On a phone the chip may take the row's width: two lines, not three. */
	@media (max-width: 47.99rem) {
		.ds-lib-scope-trigger {
			max-width: 100%;
		}
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
		box-shadow: 0 12px 28px color-mix(in oklab, var(--ds-color-foreground) 22%, transparent);
	}

	.ds-lib-scope-pop.is-up {
		top: auto;
		bottom: calc(100% + 0.375rem);
	}

	/* The layer adds no box of its own on a desktop. */
	.ds-lib-scope-layer {
		display: contents;
	}

	/* A phone: a sheet from the bottom, over a scrim. */
	.ds-lib-scope-scrim {
		position: fixed;
		z-index: 30;
		inset: 0;
		border: 0;
		padding: 0;
		background: color-mix(in oklab, var(--ds-color-foreground) 40%, transparent);
	}

	.ds-lib-scope-pop.is-sheet {
		position: fixed;
		z-index: 31;
		inset: auto 0 0 0;
		width: auto;
		max-height: min(85dvh, 36rem);
		border-width: 1px 0 0;
		border-radius: var(--ds-radius-xl) var(--ds-radius-xl) 0 0;
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}

	.ds-lib-scope-find,
	.ds-lib-scope-head {
		flex: none;
		border-bottom: 1px solid var(--ds-color-border);
	}

	.ds-lib-scope-find {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-left: 0.75rem;
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-scope-search {
		min-width: 0;
		flex: 1;
		border: 0;
		background: transparent;
		min-height: 2.75rem;
		padding: 0.625rem 0.75rem 0.625rem 0;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: 0.875rem;
		outline: none;
	}

	.ds-lib-scope-search::placeholder {
		color: var(--ds-color-muted-foreground);
	}

	.ds-lib-scope-back {
		display: flex;
		width: 100%;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.25rem;
		border: 0;
		background: none;
		padding: 0.375rem 0.75rem 0.375rem 0.5rem;
		color: var(--ds-color-foreground);
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}

	.ds-lib-scope-back span {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	/* Two panes: subjects, then what is in the one browsed. A phone shows one. */
	.ds-lib-scope-panes {
		display: grid;
		min-height: 0;
		flex: 1;
		grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
	}

	.ds-lib-scope-pop.is-flat .ds-lib-scope-panes,
	.ds-lib-scope-pop.is-sheet .ds-lib-scope-panes {
		display: flex;
		flex-direction: column;
	}

	/* Positioned: each row's offset is measured from it. */
	.ds-lib-scope-list {
		position: relative;
		min-height: 0;
		min-width: 0;
		flex: 1;
		overflow-y: auto;
		margin: 0;
		padding: 0.25rem;
		list-style: none;
		outline: none;
	}

	.ds-lib-scope-subjects {
		border-right: 1px solid var(--ds-color-border);
		background: color-mix(in oklab, var(--ds-color-surface-2) 40%, transparent);
	}

	.ds-lib-scope-pop.is-sheet .ds-lib-scope-subjects {
		border-right: 0;
		background: none;
	}

	/* 44px: a row is a thumb's target on a phone. It wraps, never cuts. */
	.ds-lib-scope-option {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.5rem;
		border-radius: var(--ds-radius-md);
		padding: 0.375rem 0.625rem;
		color: var(--ds-color-foreground);
		font-size: 0.875rem;
		line-height: 1.3;
		cursor: pointer;
	}

	.ds-lib-scope-option:hover,
	.ds-lib-scope-option.is-active {
		background: var(--ds-color-surface-2);
	}

	/* A loose collection is a pick, not a subject: a rule sets it apart. */
	.ds-lib-scope-option.is-first-loose {
		margin-top: 0.375rem;
		border-top: 1px solid var(--ds-color-border);
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}

	.ds-lib-scope-option.is-browsed {
		background: color-mix(in oklab, var(--ds-color-primary) 14%, transparent);
		font-weight: 600;
	}

	.ds-lib-scope-option-text {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
		gap: 0.125rem;
	}

	.ds-lib-scope-option-title {
		overflow-wrap: anywhere;
	}

	.ds-lib-scope-option-under {
		overflow-wrap: anywhere;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
	}

	.ds-lib-scope-option.is-whole .ds-lib-scope-option-title {
		font-weight: 600;
	}

	.ds-lib-scope-count {
		flex: none;
		color: var(--ds-color-muted-foreground);
		font-size: var(--ds-text-2xs);
		font-variant-numeric: tabular-nums;
	}

	.ds-lib-scope-none {
		margin: 0;
		padding: 0.75rem;
		color: var(--ds-color-muted-foreground);
		font-size: 0.875rem;
	}
</style>
