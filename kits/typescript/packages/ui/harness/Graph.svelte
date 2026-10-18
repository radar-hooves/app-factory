<script lang="ts">
	/**
	 * GraphCanvas at a real size (`?surface=graph`, `&n=` nodes, default 3000),
	 * on the page or, with `&shadow=1`, inside a shadow root that adopts the
	 * page's compiled stylesheet as an element does. `window.__graph` is the
	 * driver's handle: the callbacks' last values and the component's exports.
	 */
	import { mount, onMount, unmount } from 'svelte';
	import GraphCanvas from '../dist/components/ui/graph-canvas/graph-canvas.svelte';
	import type { GraphNode } from '../dist/components/ui/graph-canvas/types.js';
	import { KINDS, osint } from './graph-fixture';

	const params = new URLSearchParams(location.search);
	const total = Number(params.get('n') ?? 3000);
	const shadow = params.get('shadow') === '1';
	const fixture = osint(total);
	const nodes = fixture.nodes;
	// `&route=1`: every fourth link dashed, and the longest shortest path from the first node highlighted.
	const routeMode = params.get('route') === '1';
	const edges = routeMode
		? fixture.edges.map((e, i) => (i % 4 === 0 ? { ...e, style: 'dashed' as const } : e))
		: fixture.edges;
	function farthestPath(): string[] {
		const from = nodes[0]!.id;
		const prev = new Map<string, string | null>([[from, null]]);
		let queue = [from];
		let last = from;
		while (queue.length) {
			const next: string[] = [];
			for (const id of queue)
				for (const e of edges) {
					const other = e.source === id ? e.target : e.target === id ? e.source : null;
					if (other && !prev.has(String(other))) {
						prev.set(String(other), id);
						next.push(String(other));
						last = String(other);
					}
				}
			queue = next;
		}
		const out: string[] = [];
		for (let at: string | null | undefined = last; at; at = prev.get(at)) out.unshift(at);
		return out;
	}
	const path = routeMode ? farthestPath() : [];

	type Handle = {
		selected: string | null;
		activated: string | null;
		selections: number;
		nodes: number;
		edges: number;
		ids: string[];
		path: string[];
		neighbours(id: string): string[];
		label(id: string): string | undefined;
		api?: { fit(): void; focus(id: string): Promise<void>; locate(id: string): { x: number; y: number } | null; relayout(): void };
	};
	const handle: Handle = {
		selected: null,
		activated: null,
		selections: 0,
		nodes: nodes.length,
		edges: edges.length,
		ids: nodes.map((n) => n.id),
		path,
		label: (id) => nodes.find((n) => n.id === id)?.label,
		neighbours: (id) => {
			const out = new Set<string>();
			for (const e of edges) {
				if (e.source === id) out.add(String(e.target));
				else if (e.target === id) out.add(String(e.source));
			}
			return [...out];
		}
	};
	(window as unknown as { __graph: Handle }).__graph = handle;

	const onselect = (n: GraphNode | null) => {
		handle.selected = n?.id ?? null;
		handle.selections++;
	};
	const onactivate = (n: GraphNode) => (handle.activated = n.id);

	let host = $state<HTMLDivElement>();
	let graph = $state<Handle['api']>();
	$effect(() => {
		if (graph) handle.api = graph;
	});

	onMount(() => {
		if (!shadow) return;
		let app: Record<string, unknown> | undefined;
		void (async () => {
			if (!host) return;
			const root = host.attachShadow({ mode: 'open' });
			const sheet = new CSSStyleSheet();
			sheet.replaceSync(await (await fetch('./app.css')).text());
			root.adoptedStyleSheets = [sheet];
			const target = document.createElement('div');
			target.style.height = '100%';
			root.append(target);
			app = mount(GraphCanvas, {
				target,
				props: { nodes, edges, kinds: KINDS, directed: true, label: 'Network', onselect, onactivate }
			});
			handle.api = app as unknown as Handle['api'];
		})();
		return () => {
			if (app) void unmount(app);
		};
	});
</script>

{#if shadow}
	<div bind:this={host} class="h-dvh w-full" data-testid="graph-host"></div>
{:else}
	<div class="h-dvh w-full">
		<GraphCanvas
			bind:this={graph}
			{nodes}
			{edges}
			kinds={KINDS}
			directed
			{path}
			label="Network"
			{onselect}
			{onactivate}
		/>
	</div>
{/if}
