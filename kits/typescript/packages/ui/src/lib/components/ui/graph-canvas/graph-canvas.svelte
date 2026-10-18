<script lang="ts" generics="N extends GraphNode">
	/**
	 * A live force-directed graph of entities and relations, drawn on a canvas
	 * and themed from the --ds-* tokens of wherever it is placed, a page or an
	 * element's shadow root alike. Every colour is resolved against this
	 * component's own element, never the document, so a shadow root takes its
	 * host page's palette; nothing portals out.
	 */
	import { onMount, tick, untrack, type Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Search from '@lucide/svelte/icons/search';
	import Plus from '@lucide/svelte/icons/plus';
	import Minus from '@lucide/svelte/icons/minus';
	import Maximize from '@lucide/svelte/icons/maximize';
	import Shuffle from '@lucide/svelte/icons/shuffle';
	import Focus from '@lucide/svelte/icons/focus';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import X from '@lucide/svelte/icons/x';
	import Button from '../button/button.svelte';
	import { Input } from '../input/index.js';
	import { cn } from '$lib/utils.js';
	import { formatNumber } from '$lib/format.js';
	import { GraphScene, type Camera, type Inset } from './scene.js';
	import type { GraphEdge, GraphKind, GraphNeighbour, GraphNode, GraphShape } from './types.js';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'class' | 'onselect'> & {
		nodes: N[];
		edges: GraphEdge[];
		/** Legend order, labels, colours and shapes. Kinds in the data but not here still draw. */
		kinds?: GraphKind[];
		/** The selected node's id. */
		selected?: string | null;
		/** Kind ids the legend has switched off. */
		hiddenKinds?: string[];
		/** Arrowheads at each edge's target. */
		directed?: boolean;
		/** A path to highlight: node ids in order. Its nodes and the edges between them stay lit, labelled with their verbs; the rest dims. */
		path?: string[];
		/** The accessible name. */
		label?: string;
		/** The find field. */
		search?: boolean;
		activateLabel?: string;
		/** A click on a node, a match or a neighbour; `null` when the selection clears. */
		onselect?: (node: N | null) => void;
		/** Double-click, Enter, or the card's action: open the thing the node stands for. */
		onactivate?: (node: N) => void;
		/** Extra content for the selected node's card, under its title. */
		detail?: Snippet<[N, GraphNeighbour<N>[]]>;
		class?: string;
	};

	let {
		nodes,
		edges,
		kinds = [],
		selected = $bindable(null),
		hiddenKinds = $bindable([]),
		directed = false,
		path = [],
		label = 'Graph',
		search = true,
		activateLabel = 'Open',
		onselect,
		onactivate,
		onkeydown,
		detail,
		class: className,
		...restProps
	}: Props = $props();

	const PRIMARY = 'var(--ds-color-primary)';
	const NEIGHBOURS = 12;

	const scene = new GraphScene<N>();
	const nodeListId = `graph-nodes-${Math.random().toString(36).slice(2, 8)}`;
	let root: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let probe: HTMLSpanElement;
	let panel = $state<HTMLDivElement | null>(null);
	let card = $state<HTMLElement | null>(null);
	let findField = $state<HTMLInputElement | null>(null);
	let ctx: CanvasRenderingContext2D | null = null;

	let query = $state('');
	let showAll = $state(false);
	let listOpen = $state(false);
	let settled = $state(false);
	let cursor = $state('grab');

	// The loop. Plain variables: the frame callback runs outside any effect, and
	// a $state read here would make an effect that calls requestDraw depend on it.
	let raf = 0;
	let last = 0;
	let dirty = false;
	let follow = true;
	let firstSettle = true;
	let reduceMotion = false;
	let tween: { from: Camera; to: Camera; t0: number; dur: number } | null = null;

	const kindOf = $derived(new Map(kinds.map((k) => [k.id, k])));
	// The first node with an id wins, as it does in the scene.
	const nodeById = $derived.by(() => {
		const m = new Map<string, N>();
		for (const n of nodes) if (!m.has(n.id)) m.set(n.id, n);
		return m;
	});
	const current = $derived.by(() => {
		const n = selected ? nodeById.get(selected) : undefined;
		return n && !hiddenKinds.includes(n.kind) ? n : null;
	});

	const legendRows = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const n of nodes) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
		const rows = kinds.map((k) => ({ kind: k, count: counts.get(k.id) ?? 0 }));
		for (const [id, count] of counts) {
			if (!kindOf.has(id)) rows.push({ kind: { id, label: id }, count });
		}
		return rows;
	});

	const neighbours = $derived.by(() => {
		if (!current) return [];
		const hidden = new Set(hiddenKinds);
		const out: GraphNeighbour<N>[] = [];
		for (const e of edges) {
			const outward = e.source === current.id;
			if (!outward && e.target !== current.id) continue;
			const node = nodeById.get(outward ? e.target : e.source);
			if (!node || node.id === current.id || hidden.has(node.kind)) continue;
			out.push(e.label ? { node, label: e.label, direction: outward ? 'out' : 'in' } : { node, direction: outward ? 'out' : 'in' });
		}
		return out.sort(
			(a, b) =>
				(directed ? b.direction.localeCompare(a.direction) : 0) ||
				(a.label ?? '').localeCompare(b.label ?? '') ||
				a.node.label.localeCompare(b.node.label)
		);
	});

	// The card's list, one heading per relation, phrased so the direction reads:
	// "Director of" what this points at, "Director of this" what points here.
	const relations = $derived.by(() => {
		const shown = showAll ? neighbours : neighbours.slice(0, NEIGHBOURS);
		const groups: { heading: string; rows: GraphNeighbour<N>[] }[] = [];
		for (const nb of shown) {
			const name = nb.label ? nb.label[0]!.toLocaleUpperCase() + nb.label.slice(1) : 'Connected';
			const heading = directed && nb.label && nb.direction === 'in' ? `${name} this` : name;
			const last = groups.at(-1);
			if (last?.heading === heading) last.rows.push(nb);
			else groups.push({ heading, rows: [nb] });
		}
		return groups;
	});

	const matches = $derived.by(() => {
		const q = query.trim().toLocaleLowerCase();
		if (!q) return [];
		const hidden = new Set(hiddenKinds);
		const hits: { node: N; at: number }[] = [];
		for (const n of nodeById.values()) {
			if (hidden.has(n.kind)) continue;
			const at = n.label.toLocaleLowerCase().indexOf(q);
			if (at >= 0) hits.push({ node: n, at });
		}
		hits.sort((a, b) => a.at - b.at || a.node.label.length - b.node.label.length);
		return hits.slice(0, 8).map((h) => h.node);
	});

	// The keyboard and screen-reader route to every node: a list in reading
	// order, most connected first past the cap, the selected node always in it.
	const NODE_LIST = 200;
	const listed = $derived.by(() => {
		const hidden = new Set(hiddenKinds);
		const all = [...nodeById.values()].filter((n) => !hidden.has(n.kind));
		const degree = new Map<string, number>();
		for (const e of edges) {
			degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
			degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
		}
		const top = all.length > NODE_LIST ? [...all].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)).slice(0, NODE_LIST) : all;
		if (current && !top.includes(current)) top.push(current);
		return { rows: top.sort((a, b) => a.label.localeCompare(b.label)), total: all.length };
	});

	const routeLabels = $derived(path.flatMap((id) => nodeById.get(id)?.label ?? []));

	const summary = $derived(
		`${formatNumber(nodes.length)} ${nodes.length === 1 ? 'node' : 'nodes'} · ${formatNumber(edges.length)} ${edges.length === 1 ? 'link' : 'links'}`
	);
	const announcement = $derived(
		current
			? `${current.label}, ${kindLabel(current.kind)}, ${neighbours.length} ${neighbours.length === 1 ? 'connection' : 'connections'}`
			: ''
	);
	const routeText = $derived(routeLabels.length > 1 ? `Path: ${routeLabels.join(', then ')}.` : '');

	function kindLabel(id: string): string {
		return kindOf.get(id)?.label ?? id;
	}
	function kindColour(id: string): string {
		const k = kindOf.get(id);
		return k ? (k.color ?? PRIMARY) : 'var(--ds-color-muted-foreground)';
	}
	function kindShape(id: string): GraphShape {
		return kindOf.get(id)?.shape ?? 'circle';
	}

	// ---- the loop ----

	function schedule() {
		if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
	}
	function requestDraw() {
		dirty = true;
		schedule();
	}

	function frame(now: number) {
		raf = 0;
		// Layout time is bounded by ticks, not by paint: where a frame is slow to
		// paint (a 4K canvas, software raster), each frame advances further.
		const spent = last ? now - last : 16;
		last = now;
		let again = false;
		if (scene.hot()) {
			scene.advance(reduceMotion && firstSettle ? 24 : Math.min(Math.max(spent * 0.6, 7), 60));
			dirty = true;
			again = true;
			if (follow) {
				const to = scene.fit(undefined, chromeInset());
				if (to) scene.cam = reduceMotion ? to : ease(scene.cam, to, 0.12);
			}
			if (!scene.hot()) {
				if (follow) goTo(scene.fit(undefined, chromeInset()), firstSettle ? 500 : 300);
				firstSettle = false;
				settled = true;
			}
		}
		if (tween) {
			const t = Math.min((now - tween.t0) / tween.dur, 1);
			scene.cam = ease(tween.from, tween.to, 1 - Math.pow(1 - t, 3));
			if (t >= 1) tween = null;
			dirty = true;
			again = true;
		}
		// Under reduced motion the first layout settles off-screen and appears once.
		if (dirty && ctx && !(reduceMotion && firstSettle)) {
			scene.draw(ctx);
			dirty = false;
		}
		if (again || dirty) schedule();
		else last = 0;
	}

	/** Interpolate cameras about the view's centre, zoom in log space. */
	function ease(a: Camera, b: Camera, t: number): Camera {
		const cx = scene.width / 2;
		const cy = scene.height / 2;
		const k = Math.exp(Math.log(a.k) + (Math.log(b.k) - Math.log(a.k)) * t);
		const ax = (cx - a.x) / a.k;
		const ay = (cy - a.y) / a.k;
		const bx = (cx - b.x) / b.k;
		const by = (cy - b.y) / b.k;
		return { k, x: cx - (ax + (bx - ax) * t) * k, y: cy - (ay + (by - ay) * t) * k };
	}

	function goTo(to: Camera | null, dur = 450) {
		if (!to) return;
		if (reduceMotion || !dur) {
			tween = null;
			scene.cam = to;
			requestDraw();
			return;
		}
		tween = { from: { ...scene.cam }, to, t0: performance.now(), dur };
		schedule();
	}

	/** The part of the view the floating chrome leaves clear: a wide panel or card is a column, a narrow one a band. */
	function chromeInset(): Inset {
		const out = { top: 0, right: 0, bottom: 0, left: 0 };
		if (!root) return out;
		const r = root.getBoundingClientRect();
		if (panel) {
			const p = panel.getBoundingClientRect();
			if (p.width > r.width * 0.6) out.top = p.bottom - r.top;
			else out.left = p.right - r.left;
		}
		if (card) {
			const c = card.getBoundingClientRect();
			if (c.width > r.width * 0.6) out.bottom = r.bottom - c.top;
			else out.right = r.right - c.left;
		}
		return out;
	}

	function zoomLimits(): [number, number] {
		const all = scene.fit(undefined, chromeInset());
		return [Math.min(0.5 * (all?.k ?? 1), 0.2), 6];
	}

	// ---- what the chrome and the caller drive ----

	/** Frame every visible node. */
	export function fit() {
		follow = false;
		goTo(scene.fit(undefined, chromeInset()));
	}

	/** Select a node and frame it with its neighbours. */
	export async function focus(id: string) {
		const s = scene.byId.get(id);
		if (!s) return;
		choose(id);
		follow = false;
		await tick();
		const cam = scene.fit(scene.neighbourhood(s), chromeInset(), 2.2);
		goTo(cam && scene.neighbourhood(s).length === 1 ? { ...cam, k: Math.max(scene.cam.k, 1.4) } : cam);
	}

	/** Where a node is drawn, in px from the graph's top-left; null when it is not in the graph. */
	export function locate(id: string): { x: number; y: number } | null {
		const s = scene.byId.get(id);
		if (!s || Number.isNaN(s.x)) return null;
		return { x: scene.cam.x + s.x * scene.cam.k, y: scene.cam.y + s.y * scene.cam.k };
	}

	/** Shuffle and lay the graph out again. */
	export function relayout() {
		for (const s of scene.nodes) {
			s.x = s.y = s.vx = s.vy = NaN;
		}
		scene.sim.nodes(scene.nodes);
		scene.sim.alpha(1);
		follow = true;
		settled = false;
		requestDraw();
	}

	function zoomBy(factor: number) {
		follow = false;
		const [min, max] = zoomLimits();
		const from = { ...scene.cam };
		scene.zoomAt(scene.width / 2, scene.height / 2, factor, min, max);
		const to = scene.cam;
		scene.cam = from;
		goTo(to, 200);
	}

	function choose(id: string | null) {
		showAll = false;
		selected = id;
		const node = id ? (nodeById.get(id) ?? null) : null;
		onselect?.(node);
	}

	function toggleKind(id: string) {
		hiddenKinds = hiddenKinds.includes(id)
			? hiddenKinds.filter((k) => k !== id)
			: [...hiddenKinds, id];
		const chosen = selected ? nodeById.get(selected) : undefined;
		if (chosen && hiddenKinds.includes(chosen.kind)) choose(null);
	}

	function pickMatch(n: N) {
		query = '';
		focus(n.id);
	}

	// ---- theme ----

	function resolvePalette() {
		if (!root || !probe) return;
		const cs = getComputedStyle(root);
		const read = (colour: string) => {
			probe.style.color = colour;
			return getComputedStyle(probe).color;
		};
		const kindsMap = new Map<string, string>();
		for (const n of untrack(() => legendRows)) kindsMap.set(n.kind.id, read(kindColour(n.kind.id)));
		scene.palette = {
			kinds: kindsMap,
			fallback: read('var(--ds-color-muted-foreground)'),
			ground: read('var(--ds-color-background)'),
			ink: read('var(--ds-color-foreground)'),
			inkSoft: read('var(--ds-color-muted-foreground)'),
			edge: read('var(--ds-color-border-strong)'),
			font: cs.getPropertyValue('--ds-font-body').trim() || cs.fontFamily || 'sans-serif'
		};
		scene.clearTextCache();
		requestDraw();
	}

	// ---- props into the scene ----

	$effect(() => {
		const fresh = scene.setData(nodes, edges);
		untrack(() => {
			scene.selected = selected ? (scene.byId.get(selected) ?? null) : null;
			if (!firstSettle) scene.heat(fresh ? 0.45 : 0.15);
			settled = !scene.hot();
			resolvePalette();
			requestDraw();
		});
	});

	$effect(() => {
		scene.shapes = new Map(kinds.map((k) => [k.id, k.shape ?? 'circle']));
		void kinds.map((k) => k.color);
		untrack(resolvePalette);
	});

	$effect(() => {
		scene.hidden = new Set(hiddenKinds);
		requestDraw();
	});

	$effect(() => {
		scene.selected = selected ? (scene.byId.get(selected) ?? null) : null;
		requestDraw();
	});

	$effect(() => {
		scene.matches = new Set(matches.flatMap((n) => scene.byId.get(n.id) ?? []));
		requestDraw();
	});

	$effect(() => {
		scene.setRoute(path);
		requestDraw();
	});

	$effect(() => {
		scene.directed = directed;
		requestDraw();
	});

	// ---- pointer, wheel, keys ----

	onMount(() => {
		ctx = canvas.getContext('2d');
		reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

		function measure() {
			const r = root.getBoundingClientRect();
			const w = Math.max(r.width, 1);
			const h = Math.max(r.height, 1);
			// Two device pixels per CSS pixel at most, and no more than ~16 MP of
			// backing store: a 4K-wide graph stays a canvas the GPU fills cheaply.
			let dpr = Math.min(window.devicePixelRatio || 1, 2);
			dpr = Math.min(dpr, Math.sqrt(16_000_000 / (w * h)));
			const dw = w - scene.width;
			const dh = h - scene.height;
			if (scene.width && !follow) scene.cam = { ...scene.cam, x: scene.cam.x + dw / 2, y: scene.cam.y + dh / 2 };
			scene.width = w;
			scene.height = h;
			scene.dpr = dpr;
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
			const inset = chromeInset();
			scene.setAspect(w - inset.left - inset.right, h - inset.top - inset.bottom);
			if (follow) {
				const to = scene.fit(undefined, chromeInset());
				if (to) scene.cam = to;
			}
			requestDraw();
		}
		const ro = new ResizeObserver(measure);
		ro.observe(root);
		if (panel) ro.observe(panel);
		measure();

		// Before the first paint, a few ticks so it does not open on d3's seed spiral.
		scene.advance(reduceMotion ? 0 : 40);
		const to = scene.fit(undefined, chromeInset());
		if (to) scene.cam = to;
		requestDraw();

		const pointers = new Map<number, { x: number; y: number }>();
		type Gesture =
			| { type: 'pan'; x: number; y: number; moved: boolean }
			| { type: 'node'; id: string; x: number; y: number; moved: boolean }
			| { type: 'pinch'; d: number; mx: number; my: number; cam: Camera };
		let gesture: Gesture | null = null;

		const at = (ev: PointerEvent | MouseEvent | WheelEvent) => {
			const r = canvas.getBoundingClientRect();
			return { x: ev.clientX - r.left, y: ev.clientY - r.top };
		};
		const pinchOf = () => {
			const [a, b] = [...pointers.values()];
			if (!a || !b) return null;
			return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
		};
		const release = () => {
			if (gesture?.type === 'node') {
				const s = scene.byId.get(gesture.id);
				if (s) {
					s.fx = null;
					s.fy = null;
				}
				scene.sim.alphaTarget(0);
			}
		};

		function onDown(ev: PointerEvent) {
			if (ev.button !== 0 && ev.pointerType === 'mouse') return;
			try {
				canvas.setPointerCapture(ev.pointerId);
			} catch {
				// A pointer the browser no longer tracks: the gesture still works uncaptured.
			}
			const p = at(ev);
			pointers.set(ev.pointerId, p);
			if (pointers.size === 2) {
				release();
				const pinch = pinchOf();
				if (pinch) gesture = { type: 'pinch', ...pinch, cam: { ...scene.cam } };
				return;
			}
			if (pointers.size > 2) return;
			const hit = scene.pick(p.x, p.y, ev.pointerType === 'touch' ? 14 : 4);
			gesture = hit
				? { type: 'node', id: hit.id, x: p.x, y: p.y, moved: false }
				: { type: 'pan', x: p.x, y: p.y, moved: false };
			if (!hit) cursor = 'grabbing';
		}

		function onMove(ev: PointerEvent) {
			const p = at(ev);
			if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, p);
			if (gesture?.type === 'pinch') {
				const pinch = pinchOf();
				if (!pinch) return;
				const [min, max] = zoomLimits();
				const k = Math.min(Math.max((gesture.cam.k * pinch.d) / gesture.d, min), max);
				const wx = (gesture.mx - gesture.cam.x) / gesture.cam.k;
				const wy = (gesture.my - gesture.cam.y) / gesture.cam.k;
				scene.cam = { k, x: pinch.mx - wx * k, y: pinch.my - wy * k };
				follow = false;
				tween = null;
				requestDraw();
				return;
			}
			if (gesture) {
				const far = Math.hypot(p.x - gesture.x, p.y - gesture.y) > 4;
				if (!gesture.moved && !far) return;
				gesture.moved = true;
				if (gesture.type === 'pan') {
					scene.cam = { ...scene.cam, x: scene.cam.x + p.x - gesture.x, y: scene.cam.y + p.y - gesture.y };
					gesture.x = p.x;
					gesture.y = p.y;
					follow = false;
					tween = null;
					requestDraw();
				} else {
					const s = scene.byId.get(gesture.id);
					if (!s) return;
					const [wx, wy] = scene.toWorld(p.x, p.y);
					s.fx = wx;
					s.fy = wy;
					follow = false;
					scene.sim.alphaTarget(0.25);
					scene.heat(0.25);
					requestDraw();
				}
				return;
			}
			if (ev.pointerType !== 'mouse') return;
			const hit = scene.pick(p.x, p.y, 4);
			if (hit !== scene.hovered) {
				scene.hovered = hit;
				cursor = hit ? 'pointer' : 'grab';
				requestDraw();
			}
		}

		function onUp(ev: PointerEvent) {
			pointers.delete(ev.pointerId);
			const g = gesture;
			if (g?.type === 'pinch') {
				if (pointers.size === 0) {
					gesture = null;
					cursor = 'grab';
				}
				return;
			}
			release();
			gesture = null;
			cursor = scene.hovered ? 'pointer' : 'grab';
			if (!g || g.moved || ev.type !== 'pointerup') return;
			if (g.type === 'node') choose(g.id);
			else if (selected) choose(null);
		}

		function onLeave() {
			if (scene.hovered) {
				scene.hovered = null;
				requestDraw();
			}
		}

		function onDouble(ev: MouseEvent) {
			const p = at(ev);
			const hit = scene.pick(p.x, p.y, 4);
			if (hit && onactivate) onactivate(hit.node);
			else if (hit) focus(hit.id);
			else {
				const [min, max] = zoomLimits();
				follow = false;
				const from = { ...scene.cam };
				scene.zoomAt(p.x, p.y, 2, min, max);
				const to = scene.cam;
				scene.cam = from;
				goTo(to, 250);
			}
		}

		function onWheel(ev: WheelEvent) {
			ev.preventDefault();
			const p = at(ev);
			const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
			// A trackpad pinch arrives as a wheel with ctrlKey, in much smaller steps.
			const factor = Math.exp(-ev.deltaY * unit * (ev.ctrlKey ? 0.01 : 0.0018));
			const [min, max] = zoomLimits();
			follow = false;
			tween = null;
			scene.zoomAt(p.x, p.y, factor, min, max);
			requestDraw();
		}

		canvas.addEventListener('pointerdown', onDown);
		canvas.addEventListener('pointermove', onMove);
		canvas.addEventListener('pointerup', onUp);
		canvas.addEventListener('pointercancel', onUp);
		// A capture the browser drops without a pointerup still ends the gesture.
		canvas.addEventListener('lostpointercapture', onUp);
		canvas.addEventListener('pointerleave', onLeave);
		canvas.addEventListener('dblclick', onDouble);
		canvas.addEventListener('wheel', onWheel, { passive: false });

		// The palette follows the page: its mode class, an element host's
		// data-dark, a palette swap, the OS scheme, a web font arriving late.
		const theme = () => resolvePalette();
		const watch = ['class', 'style', 'data-theme', 'data-dark', 'data-ds-palette'];
		const mo = new MutationObserver(theme);
		mo.observe(document.documentElement, { attributes: true, attributeFilter: watch });
		const host = root.getRootNode() instanceof ShadowRoot ? (root.getRootNode() as ShadowRoot).host : null;
		if (host) mo.observe(host, { attributes: true, attributeFilter: watch });
		const scheme = matchMedia('(prefers-color-scheme: dark)');
		scheme.addEventListener?.('change', theme);
		document.fonts?.addEventListener?.('loadingdone', theme);
		resolvePalette();

		return () => {
			cancelAnimationFrame(raf);
			raf = 0;
			ro.disconnect();
			mo.disconnect();
			scheme.removeEventListener?.('change', theme);
			document.fonts?.removeEventListener?.('loadingdone', theme);
			canvas.removeEventListener('pointerdown', onDown);
			canvas.removeEventListener('pointermove', onMove);
			canvas.removeEventListener('pointerup', onUp);
			canvas.removeEventListener('pointercancel', onUp);
			canvas.removeEventListener('lostpointercapture', onUp);
			canvas.removeEventListener('pointerleave', onLeave);
			canvas.removeEventListener('dblclick', onDouble);
			canvas.removeEventListener('wheel', onWheel);
			scene.sim.stop();
		};
	});

	function onCanvasKey(ev: KeyboardEvent) {
		// Ctrl or Cmd with + - 0 is the browser's own zoom, never the graph's.
		if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
		const step = 64;
		const pan = (dx: number, dy: number) => {
			follow = false;
			goTo({ ...scene.cam, x: scene.cam.x + dx, y: scene.cam.y + dy }, 150);
		};
		if (ev.key === 'ArrowLeft') pan(step, 0);
		else if (ev.key === 'ArrowRight') pan(-step, 0);
		else if (ev.key === 'ArrowUp') pan(0, step);
		else if (ev.key === 'ArrowDown') pan(0, -step);
		else if (ev.key === '+' || ev.key === '=') zoomBy(1.3);
		else if (ev.key === '-' || ev.key === '_') zoomBy(1 / 1.3);
		else if (ev.key === '0') fit();
		else if (ev.key === 'Enter' && current && onactivate) onactivate(current);
		else return;
		ev.preventDefault();
	}

	function onRootKey(ev: KeyboardEvent) {
		if (ev.key === '/' && search && ev.target === canvas) {
			ev.preventDefault();
			findField?.focus();
			return;
		}
		if (ev.key !== 'Escape') return;
		if (query) query = '';
		else if (selected) choose(null);
		else return;
		ev.preventDefault();
	}

	function onSearchKey(ev: KeyboardEvent) {
		if (ev.key === 'Enter' && matches[0]) {
			ev.preventDefault();
			pickMatch(matches[0]);
		}
	}
</script>

{#snippet swatch(kind: string, off = false)}
	{@const shape = kindShape(kind)}
	<svg
		viewBox="-6 -6 12 12"
		class="size-3 shrink-0"
		style:color={kindColour(kind)}
		fill={off ? 'none' : 'currentColor'}
		stroke="currentColor"
		stroke-width="1.5"
		aria-hidden="true"
	>
		{#if shape === 'square'}
			<rect x="-4" y="-4" width="8" height="8" />
		{:else if shape === 'diamond'}
			<path d="M0 -5.2 L5.2 0 L0 5.2 L-5.2 0 Z" />
		{:else if shape === 'triangle'}
			<path d="M0 -5.2 L4.8 3.6 L-4.8 3.6 Z" />
		{:else}
			<circle r="4.5" />
		{/if}
	</svg>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions: Escape closes the find or the card from anywhere inside -->
<div
	bind:this={root}
	class={cn('bg-background @container relative isolate h-full min-h-80 w-full overflow-hidden', className)}
	role="group"
	aria-roledescription="graph"
	aria-label={label}
	data-slot="graph-canvas"
	data-layout={settled ? 'settled' : 'running'}
	data-selected={selected ?? undefined}
	{...restProps}
	onkeydown={(ev) => {
		onkeydown?.(ev);
		onRootKey(ev);
	}}
>
	<span bind:this={probe} class="hidden" aria-hidden="true"></span>
	<canvas
		bind:this={canvas}
		class="absolute inset-0 h-full w-full touch-none outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
		style:cursor
		tabindex="0"
		aria-roledescription="graph canvas"
		aria-label={`${label}: ${summary}.${routeText ? ' ' + routeText : ''} Arrow keys pan, plus and minus zoom, 0 fits${search ? ', slash finds' : ''}.`}
		onkeydown={onCanvasKey}
	></canvas>

	<!-- Find and legend: a column on the left of a wide graph, a bar across the top of a narrow one. -->
	<div
		bind:this={panel}
		class="border-border bg-surface-2/90 absolute inset-x-3 top-3 z-10 flex flex-col gap-2 ds-edge rounded-xl border p-2 backdrop-blur-md @2xl:inset-x-auto @2xl:left-4 @2xl:top-4 @2xl:w-64 @2xl:gap-3 @2xl:p-3"
	>
		{#if search}
			<div class="relative">
				<Search
					class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
					aria-hidden="true"
				/>
				<Input
					type="search"
					bind:ref={findField}
					bind:value={query}
					placeholder="Find…"
					aria-label={`Find in ${label}`}
					autocomplete="off"
					class="bg-background pr-8 pl-8"
					onkeydown={onSearchKey}
				/>
				{#if !query}
					<kbd
						class="text-muted-foreground border-border pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-[0.7rem] leading-4 @2xl:block"
						aria-hidden="true">/</kbd
					>
				{/if}
			</div>
			{#if matches.length}
				<ul class="-mt-1 flex flex-col" aria-label="Matches">
					{#each matches as m (m.id)}
						<li>
							<button
								type="button"
								class="hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none"
								onclick={() => pickMatch(m)}
							>
								{@render swatch(m.kind)}
								<span class="text-foreground min-w-0 flex-1 truncate">{m.label}</span>
								<span class="text-muted-foreground shrink-0 text-xs">{kindLabel(m.kind)}</span>
							</button>
						</li>
					{/each}
				</ul>
			{:else if query.trim()}
				<p class="text-muted-foreground -mt-1 px-2 py-1 text-sm">No match</p>
			{/if}
		{/if}

		<div>
			<button
				type="button"
				class="hover:bg-accent flex w-full items-center justify-between rounded-md border border-transparent px-2 py-1 text-xs @2xl:text-sm"
				aria-expanded={listOpen}
				aria-controls={nodeListId}
				onclick={() => (listOpen = !listOpen)}
			>
				<span class="text-foreground">Nodes</span>
				<span class="text-muted-foreground tabular-nums">{formatNumber(listed.total)}</span>
			</button>
			<ul
				id={nodeListId}
				class="mt-1 max-h-48 flex-col overflow-y-auto {listOpen ? 'flex' : 'hidden'}"
				aria-label="Nodes"
			>
				{#each listed.rows as n (n.id)}
					<li>
						<button
							type="button"
							class="hover:bg-accent focus-visible:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm outline-none"
							aria-pressed={selected === n.id}
							onclick={() => focus(n.id)}
						>
							{@render swatch(n.kind)}
							<span class="text-foreground min-w-0 flex-1 truncate">{n.label}</span>
							<span class="text-muted-foreground shrink-0 text-xs">{kindLabel(n.kind)}</span>
						</button>
					</li>
				{/each}
				{#if listed.total > listed.rows.length}
					<li class="text-muted-foreground px-2 py-1 text-xs">
						Most connected {formatNumber(listed.rows.length)} of {formatNumber(listed.total)}; find narrows it.
					</li>
				{/if}
			</ul>
		</div>

		{#if legendRows.length}
			<ul
				class="flex flex-wrap gap-x-1 @2xl:flex-col @2xl:flex-nowrap"
				aria-label="Kinds"
			>
				{#each legendRows as row (row.kind.id)}
					{@const off = hiddenKinds.includes(row.kind.id)}
					<li class="shrink-0">
						<button
							type="button"
							class={cn(
								'hover:bg-accent flex w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs whitespace-nowrap transition-colors @2xl:gap-2 @2xl:px-2 @2xl:text-sm',
								off ? 'text-muted-foreground border-dashed border-border [&_.ds-kind]:line-through' : 'bg-background/60 border-transparent'
							)}
							aria-pressed={!off}
							onclick={() => toggleKind(row.kind.id)}
						>
							{@render swatch(row.kind.id, off)}
							<span class={cn('ds-kind', !off && 'text-foreground')}>{row.kind.label}</span>
							<span class="text-muted-foreground ml-auto pl-1 text-xs tabular-nums @2xl:pl-2">{formatNumber(row.count)}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- View controls. A narrow graph's card covers them, so they step aside for it. -->
	<div
		class={cn(
			'border-border bg-surface-2/90 absolute right-3 bottom-3 z-10 flex flex-col ds-edge rounded-xl border p-1 backdrop-blur-md @2xl:right-4 @2xl:bottom-4',
			current && 'hidden @2xl:flex'
		)}
	>
		<Button variant="ghost" size="icon-sm" aria-label="Zoom in" title="Zoom in" onclick={() => zoomBy(1.4)}>
			<Plus />
		</Button>
		<Button variant="ghost" size="icon-sm" aria-label="Zoom out" title="Zoom out" onclick={() => zoomBy(1 / 1.4)}>
			<Minus />
		</Button>
		<Button variant="ghost" size="icon-sm" aria-label="Fit to view" title="Fit to view" onclick={fit}>
			<Maximize />
		</Button>
		<Button variant="ghost" size="icon-sm" aria-label="Lay out again" title="Lay out again" onclick={relayout}>
			<Shuffle />
		</Button>
	</div>

	<p
		class="text-muted-foreground pointer-events-none absolute bottom-4 left-4 z-10 hidden text-xs tabular-nums @2xl:block"
	>
		{summary}{settled ? '' : ' · laying out'}
	</p>

	{#if current}
		<section
			bind:this={card}
			class="border-border bg-surface-2/95 absolute inset-x-3 bottom-3 z-20 flex max-h-[48%] flex-col ds-edge overflow-hidden rounded-xl border backdrop-blur-md @2xl:inset-x-auto @2xl:top-4 @2xl:right-4 @2xl:bottom-auto @2xl:max-h-[calc(100%-2rem)] @2xl:w-80"
			aria-label={current.label}
		>
			<div class="overflow-y-auto overscroll-contain p-4">
				<div class="flex items-start gap-2">
					<div class="min-w-0 flex-1">
						<p class="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
							{@render swatch(current.kind)}
							{kindLabel(current.kind)}
						</p>
						<h3 class="font-display text-foreground mt-1 text-lg leading-snug font-semibold break-words">
							{current.label}
						</h3>
						{#if current.description}
							<p class="text-muted-foreground mt-1 text-sm leading-relaxed">{current.description}</p>
						{/if}
					</div>
					<Button
						variant="ghost"
						size="icon-sm"
						class="-mt-1 -mr-2"
						aria-label="Close"
						onclick={() => choose(null)}
					>
						<X />
					</Button>
				</div>

				<div class="mt-3 flex gap-2">
					<Button variant="outline" size="sm" onclick={() => current && focus(current.id)}>
						<Focus />
						Focus
					</Button>
					{#if onactivate}
						<Button size="sm" onclick={() => current && onactivate(current)}>
							{activateLabel}
							<ArrowUpRight />
						</Button>
					{/if}
				</div>

				{#if detail}
					<div class="mt-3">{@render detail(current, neighbours)}</div>
				{/if}

				{#if neighbours.length}
					<p class="text-muted-foreground mt-4 text-xs">
						{formatNumber(neighbours.length)}
						{neighbours.length === 1 ? 'connection' : 'connections'}
					</p>
					{#each relations as group, g (g)}
						<p class="text-foreground mt-3 mb-0.5 text-xs font-semibold">{group.heading}</p>
						<ul class="-mx-2 flex flex-col">
							{#each group.rows as nb, i (nb.node.id + '|' + i)}
								<li>
									<button
										type="button"
										class="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
										onclick={() => focus(nb.node.id)}
									>
										{@render swatch(nb.node.kind)}
										<span class="text-foreground min-w-0 flex-1 truncate">{nb.node.label}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/each}
					{#if !showAll && neighbours.length > NEIGHBOURS}
						<Button variant="link" size="sm" class="mt-1 px-0" onclick={() => (showAll = true)}>
							Show all {formatNumber(neighbours.length)}
						</Button>
					{/if}
				{/if}
			</div>
		</section>
	{/if}

	<p class="sr-only" aria-live="polite">{[announcement, routeText].filter(Boolean).join(' ')}</p>
</div>
