<script lang="ts">
	/**
	 * The shell lab.
	 *
	 * Deliberately does NOT compose AppShell. Its whole job is rendering chrome
	 * the package cannot produce yet — shape D has no page header and a rail
	 * contextual zone, neither of which AppShell has — so importing the shipped
	 * component would make the lab unable to do the one thing it exists for.
	 * The console's own routes compose AppShell; this one is upstream of it.
	 *
	 * What it DOES share is everything below the component line: the token
	 * layer, the ds-* layer, and now the Tailwind utility layer, because it
	 * lives inside a real consumer build. That last one is why this moved out of
	 * a standalone HTML file — a shape judged here is judged in the same CSS an
	 * app will render it in.
	 *
	 * Graduation path: a shape that wins here gets built into AppShell for real,
	 * and packages/ui/harness/ then verifies the shipped component in CI.
	 */
	import { PROFILES, type Section } from '$lib/profiles';
	import { toggleMode } from 'mode-watcher';
	import { AppIdentity } from '@poodle64/ui/app-identity';

	type Shape = 'today' | 'sidebar';
	type Measure = 'fill' | 'wide' | 'page' | 'prose';
	type Content = Section['content'];

	let appIx = $state(0);
	let secIx = $state(0);
	let shape = $state<Shape>('sidebar');
	let measure = $state<Measure>('wide');
	let contentOverride = $state<Content | null>(null);
	let frameWidth = $state<number | null>(null);
	let railCollapsed = $state(false);

	// Rail width is a PERSONAL preference, not an app setting, so it lives in
	// localStorage rather than in a token or a profile: the same app on two
	// machines can reasonably want two widths, and nobody else should see mine.
	const RAIL_KEY = 'ds-lab-rail-width';
	const RAIL_MIN = 200;
	const RAIL_MAX = 420;
	const RAIL_DEFAULT = 248; // 15.5rem, the package's own --ds-shell-rail-width
	// Below this a drag stops resizing and collapses instead, so collapse is the
	// far end of the same gesture rather than a second mechanism.
	const RAIL_SNAP = 170;

	let railWidth = $state(RAIL_DEFAULT);
	let dragging = $state(false);
	// Which sections are rolled open. A section opens on becoming active and can
	// then be toggled independently, so an open one stays open while you look
	// somewhere else — the behaviour a disclosure has everywhere else.
	let openSections = $state<Set<number>>(new Set([0]));

	$effect(() => {
		try {
			const v = localStorage.getItem(RAIL_KEY);
			if (v === 'collapsed') railCollapsed = true;
			else if (v) railWidth = Math.min(RAIL_MAX, Math.max(RAIL_MIN, Number(v) || RAIL_DEFAULT));
		} catch {
			// Private windows and blocked site data throw on read. A lab that will
			// not open because it could not remember a width is worse than one that
			// forgets, so this is swallowed deliberately.
		}
	});

	function persistRail() {
		try {
			localStorage.setItem(RAIL_KEY, railCollapsed ? 'collapsed' : String(Math.round(railWidth)));
		} catch {
			/* see the read above */
		}
	}

	function startDrag(e: PointerEvent) {
		dragging = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onDrag(e: PointerEvent) {
		if (!dragging) return;
		const left = (e.currentTarget as HTMLElement).closest('aside')!.getBoundingClientRect().left;
		const w = e.clientX - left;
		if (w < RAIL_SNAP) {
			railCollapsed = true;
		} else {
			railCollapsed = false;
			railWidth = Math.min(RAIL_MAX, Math.max(RAIL_MIN, w));
		}
	}

	function endDrag(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		persistRail();
	}

	function toggleRail() {
		railCollapsed = !railCollapsed;
		persistRail();
	}

	// An accordion, not independent disclosures. You are only ever IN one module,
	// so a second open section shows context for somewhere you are not — which is
	// the sidebar doing too much, and it grows without limit as modules are added.
	function toggleSection(i: number) {
		openSections = openSections.has(i) ? new Set() : new Set([i]);
	}
	let showUnused = $state(false);
	let textured = $state(true);
	// The package default is 30px. Adjustable here because the right pitch is a
	// judgement made by looking, not by argument, and whatever wins becomes the
	// token's new default rather than a per-app override.
	let pitch = $state(30);
	// A cursor-tracked glow, after Google Stitch. Pointer position is written to
	// CSS custom properties and the gradient reads them, so the browser does the
	// painting and JS only ever sets two numbers.
	let glow = $state(false);
	let glowX = $state(50);
	let glowY = $state(50);
	let glowRaf = 0;

	function trackGlow(e: PointerEvent) {
		if (!glow) return;
		// Coalesced through rAF: a pointermove fires far more often than the screen
		// refreshes, and writing a custom property on every one of them invalidates
		// paint for a full-viewport gradient each time.
		if (glowRaf) return;
		const el = e.currentTarget as HTMLElement;
		const r = el.getBoundingClientRect();
		const x = ((e.clientX - r.left) / r.width) * 100;
		const y = ((e.clientY - r.top) / r.height) * 100;
		glowRaf = requestAnimationFrame(() => {
			glowX = x;
			glowY = y;
			glowRaf = 0;
		});
	}
	// Global affordances — create, help, notifications. Grafana carries all three
	// beside its search; ours carries none, which is a large part of why the bar
	// reads empty. Off by default so the comparison is one click.
	let globals = $state(false);

	const app = $derived(PROFILES[appIx]);

	// Reset the section when the app changes. Clamping alone silently lands you
	// on whatever section happens to share the old index, which reads as the app
	// having chosen a page for you.
	let lastApp = $state(0);
	$effect(() => {
		if (appIx !== lastApp) {
			lastApp = appIx;
			secIx = 0;
			contentOverride = null;
			openSections = new Set([0]);
		}
	});
	const section = $derived(app.sections[Math.min(secIx, app.sections.length - 1)]);
	const peers = $derived(section.peers ?? []);
	const controls = $derived(section.controls ?? []);
	const who = $derived(app.identity);
	const actions = $derived(section.actions ?? []);
	// Anything contextual at all — used only by the `today` baseline now.
	const ctx = $derived(peers.length + controls.length + actions.length > 0);
	const content = $derived(contentOverride ?? section.content);
	// The roll-out carries the section's PEER VIEWS and nothing else. Actions
	// left the sidebar for the page (operator ruling, 04/09/2026): a sidebar
	// carrying navigation, actions and scope at once is the sidebar doing too
	// much, and an action belongs beside the thing it acts on.
	const inZone = $derived(shape !== 'today' && peers.length > 0);


	const NOTES: Record<Shape, string> = {
		today:
			'What the apps ship now. Search pinned left, identity right, nothing between, no location anywhere in the chrome — several apps render no page title either.',
		sidebar:
			'Sub-routes live in the sidebar under their section, and nowhere else — a peer view listed in both the rail and the top bar is the same six items twice. The top rail carries the bounded things: the section’s scope, then search, globals and identity. Actions sit on the page beside what they act on. One 56px row of chrome, no breadcrumb, no page title.'
	};

	const MEASURE_CLASS: Record<Measure, string> = {
		fill: '',
		wide: 'max-w-[120rem]',
		page: 'max-w-[80rem]',
		prose: 'max-w-[72ch]'
	};

	function pickSection(i: number) {
		secIx = i;
		contentOverride = null;
		openSections = new Set([i]);
	}

	function pickPeer(i: number) {
		peers.forEach((p, n) => (p.active = n === i));
		section.crumb = [section.crumb[0], peers[i].label];
	}

	// Live geometry. The numbers are the point of the lab: a shape that looks
	// fine and wastes 40% of the viewport is not fine.
	let frameEl = $state<HTMLElement | null>(null);
	let barEl = $state<HTMLElement | null>(null);
	let leftEl = $state<HTMLElement | null>(null);
	let rightEl = $state<HTMLElement | null>(null);
	let measureEl = $state<HTMLElement | null>(null);
	let scrollEl = $state<HTMLElement | null>(null);
	let railEl = $state<HTMLElement | null>(null);
	let zoneEl = $state<HTMLElement | null>(null);
	let navEl = $state<HTMLElement | null>(null);
	let tick = $state(0);

	$effect(() => {
		// Re-read after any state that moves the layout, and on resize.
		void [shape, measure, appIx, secIx, railCollapsed, frameWidth, content];
		const bump = () => tick++;
		requestAnimationFrame(bump);
		addEventListener('resize', bump);
		return () => removeEventListener('resize', bump);
	});

	const geom = $derived.by(() => {
		void tick;
		if (!barEl || !leftEl || !rightEl || !measureEl || !scrollEl || !railEl) return null;
		const lb = leftEl.getBoundingClientRect();
		const rb = rightEl.getBoundingClientRect();
		const gap = Math.max(0, Math.round(rb.left - lb.right));
		const barW = Math.round(barEl.clientWidth);
		const region = Math.round(scrollEl.clientWidth);
		const cw = Math.round(measureEl.getBoundingClientRect().width);
		const railH = railEl.getBoundingClientRect().height;
		const used =
			(navEl?.getBoundingClientRect().height ?? 0) +
			(zoneEl?.getBoundingClientRect().height ?? 0) +
			56;
		return {
			frame: Math.round(frameEl?.clientWidth ?? 0),
			gap,
			gapPct: barW ? Math.round((gap / barW) * 100) : 0,
			content: cw,
			region,
			contentPct: region ? Math.round((cw / region) * 100) : 0,
			unused: region - cw,
			railPct: railH ? Math.min(100, Math.round((used / railH) * 100)) : 0
		};
	});
</script>

<svelte:head><title>Shell lab</title></svelte:head>

<div class="bg-[#0e1014] flex h-screen flex-col overflow-hidden">
	<!-- Control deck. Deliberately NOT design-system styled: it is the harness
	     around the specimen, and dressing it in the tokens under test makes the
	     two impossible to tell apart at a glance. -->
	<div class="font-mono flex-none border-b-2 border-[#2b2f3a] bg-[#14161c] text-[11.5px] text-[#d7dbe3] select-none">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-1.5">
			<a href="/" class="rounded border border-[#363b47] bg-[#22262f] px-2 py-1 hover:text-white">← console</a>

			{@render lbl('App')}
			<select
				bind:value={appIx}
				onchange={() => pickSection(0)}
				class="rounded border border-[#363b47] bg-[#22262f] px-2 py-1 text-[#cfd4de]"
			>
				{#each PROFILES as p, i (p.id)}<option value={i}>{p.name}</option>{/each}
			</select>

			{@render lbl('Shape')}
			<div class="flex gap-1">
				{#each [['today', 'Today'], ['sidebar', 'Sidebar sub-routes']] as [v, t] (v)}
					<button
						onclick={() => (shape = v as Shape)}
						aria-pressed={shape === v}
						class="rounded border border-[#363b47] bg-[#22262f] px-2 py-1 hover:text-white aria-pressed:border-transparent aria-pressed:bg-[var(--ds-color-primary)] aria-pressed:font-semibold aria-pressed:text-white"
					>{t}</button>
				{/each}
			</div>

			{@render lbl('Measure')}
			<div class="flex gap-1">
				{#each ['fill', 'wide', 'page', 'prose'] as v (v)}
					<button
						onclick={() => (measure = v as Measure)}
						aria-pressed={measure === v}
						class="rounded border border-[#363b47] bg-[#22262f] px-2 py-1 hover:text-white aria-pressed:border-transparent aria-pressed:bg-[var(--ds-color-primary)] aria-pressed:font-semibold aria-pressed:text-white"
					>{v}</button>
				{/each}
			</div>

			{#if geom}
				<div class="ml-auto flex flex-wrap gap-4 text-[#8892a4]">
					<span>frame <b class="font-semibold text-[#f2c14e]">{geom.frame}</b>px</span>
					<span>bar gap <b class="font-semibold text-[#f2c14e]">{geom.gap}</b>px
						<span class={geom.gapPct > 50 ? 'text-[#ef6f6f]' : 'text-[#63c98a]'}>({geom.gapPct}%)</span></span>
					<span>content <b class="font-semibold text-[#f2c14e]">{geom.content}</b>/{geom.region}
						<span class={geom.contentPct >= 85 ? 'text-[#63c98a]' : 'text-[#ef6f6f]'}>({geom.contentPct}%)</span></span>
					<span>rail used <b class={geom.railPct >= 60 ? 'text-[#63c98a]' : 'text-[#ef6f6f]'}>{geom.railPct}%</b></span>
				</div>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#23262f] px-3.5 py-1.5">
			{@render lbl('Viewport')}
			<div class="flex gap-1">
				{#each [1280, 1512, 1920, 2560, 3360] as w (w)}
					<button
						onclick={() => (frameWidth = w)}
						aria-pressed={frameWidth === w}
						class="rounded border border-[#363b47] bg-[#22262f] px-2 py-1 hover:text-white aria-pressed:border-transparent aria-pressed:bg-[var(--ds-color-primary)] aria-pressed:font-semibold aria-pressed:text-white"
					>{w}</button>
				{/each}
				<button
					onclick={() => (frameWidth = null)}
					aria-pressed={frameWidth === null}
					class="rounded border border-[#363b47] bg-[#22262f] px-2 py-1 hover:text-white aria-pressed:border-transparent aria-pressed:bg-[var(--ds-color-primary)] aria-pressed:font-semibold aria-pressed:text-white"
				>window</button>
			</div>

			{@render lbl('Content')}
			<div class="flex gap-1">
				{#each ['dashboard', 'table', 'tiles', 'form', 'prose'] as v (v)}
					<button
						onclick={() => (contentOverride = v as Content)}
						aria-pressed={content === v}
						class="rounded border border-[#363b47] bg-[#22262f] px-2 py-1 hover:text-white aria-pressed:border-transparent aria-pressed:bg-[var(--ds-color-primary)] aria-pressed:font-semibold aria-pressed:text-white"
					>{v}</button>
				{/each}
			</div>

			{@render lbl('Dots')}
			<div class="flex gap-1">
				{#each [14, 18, 22, 26, 30] as n (n)}
					<button
						onclick={() => (pitch = n)}
						aria-pressed={pitch === n}
						class="rounded border border-[#363b47] bg-[#22262f] px-2 py-1 hover:text-white aria-pressed:border-transparent aria-pressed:bg-[var(--ds-color-primary)] aria-pressed:font-semibold aria-pressed:text-white"
					>{n}</button>
				{/each}
			</div>

			{@render lbl('Show')}
			<div class="flex gap-1">
				{#each [['unused', () => (showUnused = !showUnused), () => showUnused], ['collapse rail', () => (railCollapsed = !railCollapsed), () => railCollapsed], ['texture', () => (textured = !textured), () => textured]] as [t, fn, on] (t)}
					<button
						onclick={fn as () => void}
						aria-pressed={(on as () => boolean)()}
						class="rounded border border-[#363b47] bg-[#22262f] px-2 py-1 hover:text-white aria-pressed:border-transparent aria-pressed:bg-[var(--ds-color-primary)] aria-pressed:font-semibold aria-pressed:text-white"
					>{t}</button>
				{/each}
				<button
					onclick={() => (glow = !glow)}
					aria-pressed={glow}
					class="rounded border border-[#363b47] bg-[#22262f] px-2 py-1 hover:text-white aria-pressed:border-transparent aria-pressed:bg-[var(--ds-color-primary)] aria-pressed:font-semibold aria-pressed:text-white"
				>cursor glow</button>
				<button
					onclick={() => (globals = !globals)}
					aria-pressed={globals}
					class="rounded border border-[#363b47] bg-[#22262f] px-2 py-1 hover:text-white aria-pressed:border-transparent aria-pressed:bg-[var(--ds-color-primary)] aria-pressed:font-semibold aria-pressed:text-white"
				>global actions</button>
				<button onclick={toggleMode} class="rounded border border-[#363b47] bg-[#22262f] px-2 py-1 hover:text-white">theme</button>
			</div>
		</div>
	</div>

	<!-- Stage: a framed viewport, so a narrow width can be judged inside a wide window. -->
	<div class="flex min-h-0 flex-1 justify-center {frameWidth ? 'p-3' : ''}">
		<div
			bind:this={frameEl}
			style="--ds-color-primary: oklch(0.55 0.145 {app.hue}); --ds-color-primary-foreground: oklch(0.99 0.005 {app.hue}); --ds-color-ring: oklch(0.55 0.145 {app.hue}); {frameWidth ? `max-width:${frameWidth}px` : ''}"
			class="bg-background flex h-full w-full min-w-0 {frameWidth
				? 'overflow-hidden rounded-md border border-[#2b2f3a] shadow-[0_8px_40px_rgb(0_0_0/0.45)]'
				: ''}"
		>
			<!-- Rail -->
			<aside
				bind:this={railEl}
				style={railCollapsed ? '' : `width:${railWidth}px`}
				class="bg-surface-1 border-border relative flex flex-none flex-col border-r {railCollapsed
					? 'w-14'
					: ''} {dragging ? '' : 'transition-[width] duration-150'}"
			>
				<div class="flex h-14 flex-none items-center gap-2.5 px-4 {railCollapsed ? 'justify-center px-0' : ''}">
					{#if railCollapsed}
						<!-- Collapsed, the mark IS the way back. A collapse control that
						     renders only while expanded strands the rail: there is nothing
						     left on screen to press. -->
						<button
							onclick={toggleRail}
							aria-label="Expand rail"
							title="Expand rail"
							class="border-border bg-background hover:border-border-strong grid size-7 flex-none place-items-center rounded-md border text-sm"
						>{app.mark}</button>
					{:else}
						<span class="border-border bg-background grid size-7 flex-none place-items-center rounded-md border text-sm">{app.mark}</span>
						<span class="font-display truncate text-[15px] font-semibold tracking-tight">{app.name}</span>
						<button
							onclick={toggleRail}
							aria-label="Collapse rail"
							title="Collapse rail"
							class="text-muted-foreground hover:bg-surface-2 hover:text-foreground ml-auto grid size-7 flex-none place-items-center rounded-sm"
						>▮|</button>
					{/if}
				</div>

				<nav bind:this={navEl} class="overflow-x-hidden overflow-y-auto px-2.5 py-1.5">
					{#each app.sections as s, i (s.label)}
						{@const rolls = inZone !== undefined && shape !== 'today' && (s.peers?.length ?? 0) > 0}
						{@const open = openSections.has(i)}
						<div class="flex items-center">
							<button
								onclick={() => pickSection(i)}
								title={railCollapsed ? s.label : undefined}
								class="hover:bg-surface-2 flex h-[34px] min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-[13.5px] {i ===
								secIx
									? 'bg-surface-2 font-semibold'
									: ''} {railCollapsed ? 'justify-center px-0' : ''}"
							>
								<span class="w-4 flex-none text-center text-[13px] opacity-75">{s.icon}</span>
								{#if !railCollapsed}<span class="truncate">{s.label}</span>{/if}
							</button>
							{#if rolls && !railCollapsed}
								<!-- The roll-out is its own control, so opening a section and
								     navigating to it are separable — the thing a chevron that
								     doubles as the nav link takes away. -->
								<button
									onclick={() => toggleSection(i)}
									aria-expanded={open}
									aria-label={open ? `Collapse ${s.label}` : `Expand ${s.label}`}
									class="text-muted-foreground hover:bg-surface-2 hover:text-foreground grid size-6 flex-none place-items-center rounded-sm text-[10px] transition-transform {open
										? 'rotate-90'
										: ''}"
								>›</button>
							{/if}
						</div>
						{#if rolls && open && !railCollapsed}
							{@render rollout(s)}
						{/if}
					{/each}
				</nav>

				<!-- Drag to resize; drag past the snap point and it collapses, so
				     collapse is the far end of one gesture rather than a second
				     mechanism. Double-click restores the package's 15.5rem. -->
				<div
					role="separator"
					aria-orientation="vertical"
					aria-label="Resize rail"
					onpointerdown={startDrag}
					onpointermove={onDrag}
					onpointerup={endDrag}
					onpointercancel={endDrag}
					ondblclick={() => {
						railCollapsed = false;
						railWidth = RAIL_DEFAULT;
						persistRail();
					}}
					class="hover:bg-primary/40 absolute inset-y-0 -right-1 z-30 w-2 cursor-col-resize {dragging
						? 'bg-primary/60'
						: ''}"
				></div>
			</aside>

			<!-- Pane -->
			<div class="flex min-w-0 flex-1 flex-col">
				<header
					bind:this={barEl}
					class="bg-surface-1 border-border sticky top-0 z-20 flex h-14 flex-none items-center gap-3 border-b px-5"
				>
					{#if shape === 'today'}
						<div bind:this={leftEl} class="border-border bg-background text-muted-foreground flex h-[34px] w-[clamp(200px,32vw,560px)] items-center gap-2.5 rounded-md border px-2.5 text-[13px]">
							<span>⌕</span><span class="truncate">{app.searchLabel}</span>
							<span class="border-border font-mono ml-auto rounded-sm border px-1.5 py-0.5 text-[10px]">⌘K</span>
						</div>
					{:else}
						<!-- No breadcrumb and no peer tabs. Sub-routes live in the sidebar
						     under their section; listing them here too is the same six items
						     twice (operator ruling, 04/09/2026). What rises into the top rail
						     is only what is BOUNDED — a scope control or two — which is why
						     it still fits at 1280 where a seven-tab strip did not. -->
						<div bind:this={leftEl} class="flex min-w-0 flex-none items-center gap-2">
							{#if controls.length}
								{@render pageControls()}
							{:else}
								<span class="text-muted-foreground text-sm">{section.label}</span>
							{/if}
						</div>
					{/if}

					<div bind:this={rightEl} class="ml-auto flex flex-none items-center gap-2.5">
						{#if shape !== 'today'}
							<div class="border-border bg-background text-muted-foreground flex h-[34px] w-[clamp(180px,22vw,380px)] items-center gap-2.5 rounded-md border px-2.5 text-[13px]">
								<span>⌕</span><span class="truncate">{app.searchLabel}</span>
								<span class="border-border font-mono ml-auto rounded-sm border px-1.5 py-0.5 text-[10px]">⌘K</span>
							</div>
						{/if}
						{#if globals}
							{#each [['+', 'Create'], ['?', 'Help'], ['◔', 'Notifications']] as [glyph, label] (label)}
								<button
									aria-label={label}
									title={label}
									class="border-border text-muted-foreground hover:text-foreground grid size-[34px] flex-none place-items-center rounded-md border"
								>{glyph}</button>
							{/each}
							<div class="bg-border mx-0.5 h-5 w-px flex-none"></div>
						{/if}
						<button
							onclick={toggleMode}
							aria-label="Toggle theme"
							class="border-border text-muted-foreground hover:text-foreground grid size-[34px] flex-none place-items-center rounded-md border"
						>◐</button>
						<!-- The graduated shape, not a lab mock: @poodle64/ui's real
						     AppIdentity, the component every stamped app's identity slot
						     now composes. Wired to no-ops here — the lab has no session to
						     sign out of — a real app passes auth.logout() and its own
						     settings route. -->
						<AppIdentity
							user={{ username: who.username, display_name: who.display_name, email: who.email }}
							workspace={who.workspace}
							role={who.role}
							entitlements={who.entitlements}
							onSwitchTheme={toggleMode}
							onSignOut={() => {}}
						/>
					</div>
				</header>

				<main
					bind:this={scrollEl}
					onpointermove={trackGlow}
					style="--ds-shell-texture-grid-pitch: {pitch}px; --lab-glow-x: {glowX}%; --lab-glow-y: {glowY}%"
					class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto {textured
						? 'ds-shell-texture'
						: ''} {glow ? 'lab-glow' : ''}"
					data-texture={textured ? 'grid' : undefined}
				>
					<div
						bind:this={measureEl}
						class="relative flex min-h-0 w-full min-w-0 flex-1 flex-col px-8 pt-6 pb-16 {MEASURE_CLASS[measure]} {measure !==
						'fill'
							? 'mx-auto'
							: ''}"
					>
						{#if showUnused && measure !== 'fill'}
							<div class="font-mono pointer-events-none absolute inset-y-0 right-full w-[50vw] [writing-mode:vertical-rl] grid place-items-center text-[10px] tracking-[0.3em] text-[oklch(0.62_0.18_27/0.9)] uppercase [background:repeating-linear-gradient(135deg,oklch(0.62_0.18_27/0.1)_0_6px,transparent_6px_12px)]">unused</div>
							<div class="font-mono pointer-events-none absolute inset-y-0 left-full w-[50vw] [writing-mode:vertical-rl] grid place-items-center text-[10px] tracking-[0.3em] text-[oklch(0.62_0.18_27/0.9)] uppercase [background:repeating-linear-gradient(135deg,oklch(0.62_0.18_27/0.1)_0_6px,transparent_6px_12px)]">unused</div>
						{/if}

						{#if shape === 'today'}
							<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
								<div class="min-w-0">
									<h1 class="font-display text-[28px] leading-tight font-semibold tracking-[-0.02em]">
										{section.crumb[section.crumb.length - 1]}
									</h1>
								</div>
								{#if actions.length}
									<div class="flex min-w-0 flex-wrap items-center justify-end gap-2">
										{#each actions as a (a.label)}{@render btn(a.label, a.primary)}{/each}
									</div>
								{/if}
							</div>
						{/if}

						{#if shape !== 'today' && actions.length}
							<!-- Actions live on the page, beside what they act on. -->
							<div class="mb-5 flex flex-wrap items-center gap-2">
								{#each actions as a (a.label)}{@render btn(a.label, a.primary)}{/each}
							</div>
						{/if}

						{#if shape === 'today' && ctx}
							<!-- The baseline's ad-hoc row: this is where the real apps put
							     peer views and scope today, each in its own way. -->
							<div class="mb-5">
								<div class="border-border flex gap-0.5 border-b">{@render peerTabs()}</div>
								{#if controls.length}
									<div class="mt-3.5 flex gap-2">{@render pageControls()}</div>
								{/if}
							</div>
						{/if}

						{@render body()}

						<div class="border-primary bg-surface-1 text-muted-foreground mt-7 rounded-r-md border-l-[3px] px-4 py-3 text-[12.5px] leading-relaxed">
							{NOTES[shape]}
						</div>
					</div>
				</main>
			</div>
		</div>
	</div>
</div>

{#snippet lbl(t: string)}
	<span class="text-[9.5px] tracking-[0.1em] text-[#6f778a] uppercase">{t}</span>
{/snippet}

{#snippet peerTabs()}
	{#each peers as p, i (p.label)}
		<button
			onclick={() => pickPeer(i)}
			class="text-muted-foreground hover:text-foreground relative flex h-11 items-center px-3 text-[13.5px] whitespace-nowrap {p.active
				? 'text-foreground after:bg-primary font-semibold after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-t-sm after:content-[\'\']'
				: ''}"
		>
			{p.label}
			{#if p.count}<span class="bg-surface-2 text-muted-foreground font-mono ml-1.5 rounded-full px-1.5 py-px text-[10px]">{p.count}</span>{/if}
		</button>
	{/each}
{/snippet}

{#snippet pageControls()}
	{#each controls as c (c.k)}
		{#if c.options}
			<!-- Segmented: a small fixed set, so showing every option costs less
			     than hiding them behind a dropdown. -->
			<div class="border-border bg-surface-1 flex h-[30px] items-center gap-0.5 rounded-md border p-0.5">
				{#each c.options as o (o)}
					<button
						onclick={() => (c.v = o)}
						aria-pressed={c.v === o}
						class="text-muted-foreground hover:text-foreground h-[24px] rounded-[0.3rem] px-2 text-[12px] whitespace-nowrap aria-pressed:bg-[var(--ds-color-surface-3)] aria-pressed:text-[var(--ds-color-foreground)] aria-pressed:font-semibold"
					>{o}</button>
				{/each}
			</div>
		{:else}
			<button class="border-border bg-surface-1 hover:border-border-strong flex h-[30px] items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] whitespace-nowrap">
				<span class="text-muted-foreground">{c.k}</span><span>{c.v}</span>
				<span class="text-muted-foreground text-[9px]">▾</span>
			</button>
		{/if}
	{/each}
{/snippet}

{#snippet btn(label: string, primary = false)}
	<button
		class="border-border h-[34px] rounded-md border px-3.5 text-[13px] whitespace-nowrap {primary
			? 'bg-primary border-primary text-primary-foreground font-semibold'
			: 'bg-surface-1 hover:border-border-strong'}"
	>{label}</button>
{/snippet}

{#snippet rollout(s: Section)}
	<!-- Peer views only. The section's own row above IS its dashboard, so the
	     default view is never listed here as a child of itself. -->
	{#each s.peers ?? [] as p, i (p.label)}
		<button
			onclick={() => pickPeer(i)}
			class="text-muted-foreground hover:bg-surface-2 hover:text-foreground flex h-8 w-full items-center rounded-md pr-2 pl-[30px] text-[13px] whitespace-nowrap {p.active
				? 'bg-surface-2 text-foreground font-semibold'
				: ''}"
		>
			{p.label}
			{#if p.count}<span class="text-muted-foreground font-mono ml-auto text-[10px]">{p.count}</span>{/if}
		</button>
	{/each}
{/snippet}

{#snippet body()}
	{#if content === 'dashboard' || content === 'table'}
		{#if content === 'dashboard'}
			<div class="mb-5 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
				{#each [['Contributed', '$420,000.00', ''], ['Withdrawn', '$318,450.00', ''], ['Net gain', '$41,275.60', 'text-status-success'], ['Return on capital', '9.8%', 'text-status-success']] as [k, v, c] (k)}
					<div class="border-border bg-surface-2 rounded-lg border px-4 py-4">
						<div class="text-muted-foreground mb-1.5 text-[11px] tracking-[0.1em] uppercase">{k}</div>
						<div class="font-mono text-[21px] font-semibold tracking-tight tabular-nums {c}">{v}</div>
					</div>
				{/each}
			</div>
		{/if}
		<div class="border-border bg-surface-2 overflow-hidden rounded-lg border">
			<div class="border-border border-b px-4.5 pt-4 pb-3">
				<div class="text-[14.5px] font-semibold">Accounts</div>
				<div class="text-muted-foreground mt-0.5 text-[12.5px]">Select an account to see its ledger and detail.</div>
			</div>
			<table class="w-full border-collapse text-[13px]">
				<thead>
					<tr>
						{#each ['Account', 'Platform', 'Owner', 'Status'] as h (h)}
							<th class="text-muted-foreground border-border border-b px-4.5 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] uppercase">{h}</th>
						{/each}
						{#each ['Realised', 'Events'] as h (h)}
							<th class="text-muted-foreground border-border font-mono border-b px-4.5 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] uppercase">{h}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each ROWS as r (r[0])}
						<tr class="hover:bg-surface-1">
							<td class="border-border border-b px-4.5 py-2.5">{r[0]}</td>
							<td class="border-border border-b px-4.5 py-2.5">{r[1]}</td>
							<td class="border-border border-b px-4.5 py-2.5">{r[2]}</td>
							<td class="border-border border-b px-4.5 py-2.5">{r[3]}</td>
							<td class="border-border font-mono border-b px-4.5 py-2.5 text-right tabular-nums {(r[4] as number) < 0 ? 'text-status-error' : 'text-status-success'}">
								{(r[4] as number).toLocaleString('en-AU', { minimumFractionDigits: 2 })}
							</td>
							<td class="border-border font-mono border-b px-4.5 py-2.5 text-right tabular-nums">{(r[5] as number).toLocaleString('en-AU')}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if content === 'tiles'}
		<div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
			{#each TILES as [t, d] (t)}
				<div class="border-border bg-surface-2 flex flex-col gap-2.5 rounded-lg border p-4.5">
					<div class="bg-primary/15 text-primary grid size-8.5 place-items-center rounded-md text-[15px]">▤</div>
					<h3 class="font-display m-0 text-base font-semibold">{t}</h3>
					<p class="text-muted-foreground m-0 text-[13px] leading-relaxed">{d}</p>
				</div>
			{/each}
		</div>
	{:else if content === 'form'}
		<div class="border-border bg-surface-2 overflow-hidden rounded-lg border">
			<div class="border-border border-b px-4.5 pt-4 pb-3">
				<div class="text-[14.5px] font-semibold">Default settings</div>
				<div class="text-muted-foreground mt-0.5 text-[12.5px]">Applied to every new record created through the API.</div>
			</div>
			<div class="grid gap-5 p-5 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
				{#each FIELDS as [l, h] (l)}
					<div class="flex flex-col gap-1.5">
						<label class="text-[12.5px] font-semibold" for={l}>{l}</label>
						<div id={l} class="border-border bg-surface-2 text-muted-foreground flex h-9 items-center rounded-md border px-2.5 text-[13px]">—</div>
						<div class="text-muted-foreground text-xs">{h}</div>
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="text-[15px] leading-[1.72]">
			<p class="mb-4">The shell answers three questions, and every surveyed product separates them onto different surfaces: where am I in the app, which view of it am I looking at, and what is globally available.</p>
			<h2 class="font-display mt-7 mb-2.5 text-xl font-semibold">Why the measure matters here</h2>
			<p class="mb-4">Running text has an optimal measure of roughly sixty-six characters a line, and beyond about ninety the eye loses the return sweep — it becomes hard to find the start of the next line, and reading speed drops measurably. This is the one content shape where filling a 3360px viewport is actively worse than capping it, which is why a single global width answer cannot be right for both a ledger and a page of explanation.</p>
			<p class="mb-4">A table wants every pixel: columns truncate, and truncation costs a click to recover what was already on screen. A form does not want them, because a text input stretched to 1500px looks broken and reads worse than one at 340px. A card grid wants more columns rather than wider cards. Each of those is a different answer, and none of them is a number typed into a page.</p>
		</div>
	{/if}
{/snippet}

<script module lang="ts">
	// Fabricated rows. Real account identifiers, holder names and balances never
	// enter this repo; the shape is what the lab needs, the values are invented.
	const ROWS: (string | number)[][] = [
		['Broker A 1000001', 'cTrader', 'Trust', 'Active', 321857.83, 2014],
		['Broker B 1000002', 'NA', 'Individual', 'Active', 210088.98, 156],
		['Broker A 1000003', 'IRESS', 'Individual', 'Active', 28332.48, 759],
		['Broker A 1000004', 'IRESS', 'Joint', 'Active', 17903.76, 783],
		['Broker A 1000005', 'MT5', 'Trust', 'Dormant', 4758.16, 41],
		['Broker A 1000006', 'IRESS', 'SMSF', 'Active', -4159.25, 118],
		['Broker B 1000007', 'NA', 'Joint', 'Closed', -66724.75, 11],
		['Broker C 1000008', 'TWS', 'Trust', 'Active', -255044.77, 646],
		['Broker B 1000009', 'NA', 'Individual', 'Active', -280964.98, 206],
		['Broker B 1000010', 'NA', 'SMSF', 'Dormant', -472465.78, 69]
	];

	const TILES: [string, string][] = [
		['Marketplace', 'The strategy paper, the questions still open against it, and the working papers underneath.'],
		['Library', 'The primary-source evidence base — every collection behind the strategy.'],
		['Education', 'Autonomy and open-architecture education library.'],
		['Leave', 'Chapter 5 leave planning — service history and balances.'],
		['Intelligence', 'The entity/assertion knowledge graph, cut temporally or by gap.'],
		['Records', 'Preserved activity, kept as a record.']
	];

	const FIELDS: [string, string][] = [
		['Role', 'Which permissions a new member starts with'],
		['Maximum budget', 'Cap in AUD, blank for none'],
		['Budget period', 'daily, weekly or monthly'],
		['Region', 'Where records are stored'],
		['Retention', 'How long soft-deleted rows survive'],
		['Notification address', 'Where alerts are sent']
	];
</script>

<style>
	/* Cursor glow, after Google Stitch. It is a pseudo-element rather than a
	   fourth background layer because .ds-shell-texture already owns
	   background-image on this element, and appending to that shorthand from
	   outside the package is exactly the local fork this repo exists to stop.

	   `position: fixed` so it tracks the viewport rather than the scrolled
	   content: the glow follows the cursor, and the cursor does not scroll away.
	   `pointer-events: none` so it never eats a click, and it sits at z-index 0
	   under content that establishes its own stacking. */
	:global(.lab-glow::before) {
		content: '';
		position: fixed;
		inset: 0;
		z-index: 0;
		pointer-events: none;
		background: radial-gradient(
			22rem 22rem at var(--lab-glow-x, 50%) var(--lab-glow-y, 50%),
			color-mix(in oklch, var(--ds-color-primary) 14%, transparent),
			transparent 70%
		);
		transition: opacity 200ms ease;
	}

	/* Someone who has asked for less motion has asked for less of this. */
	@media (prefers-reduced-motion: reduce) {
		:global(.lab-glow::before) {
			display: none;
		}
	}
</style>
