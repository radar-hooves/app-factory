/**
 * The graph's world: d3-force for the layout, a Canvas 2D painter, the camera
 * and hit-testing. No Svelte in here; the component owns the loop, the
 * pointer and the chrome, and calls in.
 *
 * Paint cost is bounded at any size: edges and nodes are culled to the
 * viewport and stroked as a handful of batched paths, labels are placed
 * greedily in screen space against a grid of what is already drawn, and the
 * label pass stops at a fixed budget, so a few thousand nodes paint in a few
 * milliseconds and the layout's own ticks are the cost that dominates.
 */
import {
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	forceX,
	forceY,
	type Simulation,
	type SimulationLinkDatum,
	type SimulationNodeDatum
} from 'd3-force';
import type { GraphEdge, GraphNode, GraphShape } from './types.js';

export interface SimNode<N extends GraphNode = GraphNode> extends SimulationNodeDatum {
	id: string;
	node: N;
	x: number;
	y: number;
	r: number;
	degree: number;
}

export interface SimEdge<N extends GraphNode = GraphNode> extends SimulationLinkDatum<SimNode<N>> {
	source: SimNode<N>;
	target: SimNode<N>;
	edge: GraphEdge;
	/** Signed curvature: parallel edges between one pair fan out. */
	bend: number;
}

/** Every colour already resolved to a value canvas parses. */
export interface ScenePalette {
	kinds: Map<string, string>;
	fallback: string;
	ground: string;
	ink: string;
	inkSoft: string;
	edge: string;
	font: string;
}

export interface Camera {
	k: number;
	x: number;
	y: number;
}

export interface Inset {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

const MAX_LABELS = 240;
/** Screen area per label at rest; past the quota only a node drawn large enough is named. */
const LABEL_AREA = 30_000;
const MAX_LABEL_TRIES = 1500;
const MAX_EDGE_LABELS = 160;
const CELL = 48;

export class GraphScene<N extends GraphNode = GraphNode> {
	nodes: SimNode<N>[] = [];
	edges: SimEdge<N>[] = [];
	byId = new Map<string, SimNode<N>>();
	adj = new Map<SimNode<N>, Set<SimNode<N>>>();
	/** Label priority, fixed per data set: emphasis, then degree. */
	ranked: SimNode<N>[] = [];

	cam: Camera = { k: 1, x: 0, y: 0 };
	width = 0;
	height = 0;
	dpr = 1;

	palette: ScenePalette | null = null;
	shapes = new Map<string, GraphShape>();
	hidden = new Set<string>();
	directed = false;
	selected: SimNode<N> | null = null;
	hovered: SimNode<N> | null = null;
	matches = new Set<SimNode<N>>();
	/** The highlighted route: its nodes and every edge joining consecutive ones. */
	routeNodes = new Set<SimNode<N>>();
	routeEdges = new Set<SimEdge<N>>();
	private routeIds: readonly string[] = [];

	readonly sim: Simulation<SimNode<N>, SimEdge<N>>;
	private link = forceLink<SimNode<N>, SimEdge<N>>([]);
	private charge = forceManyBody<SimNode<N>>().strength((d) => -28 - 14 * Math.sqrt(d.degree));
	private collide = forceCollide<SimNode<N>>((d) => d.r + 3);
	private ticks = 0;
	private gx = forceX<SimNode<N>>(0).strength(0.05);
	private gy = forceY<SimNode<N>>(0).strength(0.05);
	private widths = new Map<string, number>();
	private grid = new Map<number, number[]>();
	private boxes: number[] = [];

	constructor() {
		this.link.distance((l) => 24 + l.source.r + l.target.r);
		this.sim = forceSimulation<SimNode<N>, SimEdge<N>>([])
			.stop()
			.alphaMin(0.008)
			.alphaDecay(0.0228)
			.velocityDecay(0.4)
			.force('charge', this.charge)
			.force('link', this.link)
			// Overlap only matters once the graph has opened out, and collision is
			// a third of a tick's cost: it waits for the layout to cool, then
			// resolves on every other tick, which still converges.
			.force(
				'collide',
				Object.assign((alpha: number) => (alpha < 0.45 && ++this.ticks % 2 ? this.collide(alpha) : undefined), {
					initialize: (nodes: SimNode<N>[], random: () => number) =>
						this.collide.initialize(nodes, random)
				})
			)
			.force('x', this.gx)
			.force('y', this.gy);
	}

	/** Gravity follows the frame's shape, so a wide view lays out wide and a phone tall. */
	setAspect(width: number, height: number): void {
		const ratio = Math.min(Math.max(width / Math.max(height, 1), 0.4), 2.5);
		this.gx.strength(0.05 * ratio ** -0.75);
		this.gy.strength(0.05 * ratio ** 0.75);
	}

	/** Replace the data, keeping every surviving node where it is. */
	setData(nodes: readonly N[], edges: readonly GraphEdge[]): number {
		const prev = this.byId;
		const byId = new Map<string, SimNode<N>>();
		const fresh: SimNode<N>[] = [];
		for (const node of nodes) {
			if (byId.has(node.id)) continue;
			const old = prev.get(node.id);
			const s: SimNode<N> = old ?? { id: node.id, node, x: NaN, y: NaN, r: 0, degree: 0 };
			s.node = node;
			s.degree = 0;
			if (!old) fresh.push(s);
			byId.set(node.id, s);
		}
		const adj = new Map<SimNode<N>, Set<SimNode<N>>>();
		for (const s of byId.values()) adj.set(s, new Set());
		const pairs = new Map<string, number>();
		const list: SimEdge<N>[] = [];
		for (const edge of edges) {
			const a = byId.get(edge.source);
			const b = byId.get(edge.target);
			if (!a || !b || a === b) continue;
			const key = a.id < b.id ? `${a.id}\u0000${b.id}` : `${b.id}\u0000${a.id}`;
			const i = pairs.get(key) ?? 0;
			pairs.set(key, i + 1);
			// 1, -1, 2, -2 … relative to the pair's own lower-id → higher-id axis.
			const fan = (i % 2 ? -1 : 1) * (1 + Math.floor(i / 2));
			list.push({ source: a, target: b, edge, bend: a.id < b.id ? fan : -fan });
			a.degree++;
			b.degree++;
			adj.get(a)?.add(b);
			adj.get(b)?.add(a);
		}
		for (const s of byId.values()) {
			s.r = s.node.size ?? Math.min(2.5 + 2.8 * Math.sqrt(s.degree), 26) + (s.node.emphasis ? 3 : 0);
		}
		// A newcomer starts beside the nodes it joins, so a live graph grows in
		// place; with no placed neighbour, d3 seeds it on its phyllotaxis.
		for (const s of fresh) {
			let n = 0;
			let x = 0;
			let y = 0;
			for (const m of adj.get(s) ?? []) {
				if (Number.isNaN(m.x)) continue;
				x += m.x;
				y += m.y;
				n++;
			}
			if (n) {
				const a = Math.random() * Math.PI * 2;
				s.x = x / n + Math.cos(a) * (s.r + 16);
				s.y = y / n + Math.sin(a) * (s.r + 16);
			}
		}
		this.byId = byId;
		this.adj = adj;
		this.nodes = [...byId.values()];
		this.edges = list;
		this.ranked = [...this.nodes].sort(
			(p, q) => Number(!!q.node.emphasis) - Number(!!p.node.emphasis) || q.degree - p.degree
		);
		// A big graph trades a little accuracy for ticks it can afford.
		const big = this.nodes.length > 1200;
		this.charge.theta(big ? 1.1 : 0.9).distanceMax(big ? 480 : 900);
		this.sim.alphaDecay(big ? 0.032 : 0.0228);
		this.sim.nodes(this.nodes);
		this.link.links(list);
		if (this.selected) this.selected = byId.get(this.selected.id) ?? null;
		if (this.hovered) this.hovered = byId.get(this.hovered.id) ?? null;
		this.matches = new Set([...this.matches].flatMap((m) => byId.get(m.id) ?? []));
		this.setRoute(this.routeIds);
		return fresh.length;
	}

	/** Highlight a path given as node ids in order; ids not in the graph are skipped. */
	setRoute(ids: readonly string[]): void {
		this.routeIds = ids;
		const nodes = ids.flatMap((id) => this.byId.get(id) ?? []);
		this.routeNodes = new Set(nodes);
		const key = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
		const pairs = new Set<string>();
		for (let i = 1; i < nodes.length; i++) pairs.add(key(nodes[i - 1]!.id, nodes[i]!.id));
		this.routeEdges = new Set(this.edges.filter((e) => pairs.has(key(e.source.id, e.target.id))));
	}

	hot(): boolean {
		return this.sim.alpha() >= this.sim.alphaMin();
	}

	heat(alpha: number): void {
		this.sim.alpha(Math.max(this.sim.alpha(), alpha));
	}

	/** Advance the layout for at most `budgetMs`, and at least one tick. */
	advance(budgetMs: number): void {
		const t0 = performance.now();
		do this.sim.tick();
		while (this.hot() && performance.now() - t0 < budgetMs);
	}

	visible(s: SimNode<N>): boolean {
		return !this.hidden.has(s.node.kind);
	}

	neighbourhood(s: SimNode<N>): SimNode<N>[] {
		return [s, ...(this.adj.get(s) ?? [])].filter((n) => this.visible(n));
	}

	/** The camera that frames `subset` (default: every visible node) inside the inset box. */
	fit(subset?: Iterable<SimNode<N>>, inset?: Inset, maxK = 1.8): Camera | null {
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		for (const s of subset ?? this.nodes) {
			if (!this.visible(s) || Number.isNaN(s.x)) continue;
			x0 = Math.min(x0, s.x - s.r);
			y0 = Math.min(y0, s.y - s.r);
			x1 = Math.max(x1, s.x + s.r);
			y1 = Math.max(y1, s.y + s.r + 16);
		}
		if (x0 === Infinity) return null;
		const pad = Math.min(48, Math.min(this.width, this.height) * 0.06);
		// Names hang below and either side of a node: room for half a name.
		const side = pad + Math.min(56, this.width * 0.1);
		const box = {
			left: (inset?.left ?? 0) + side,
			top: (inset?.top ?? 0) + pad,
			right: this.width - (inset?.right ?? 0) - side,
			bottom: this.height - (inset?.bottom ?? 0) - pad
		};
		const bw = Math.max(box.right - box.left, 40);
		const bh = Math.max(box.bottom - box.top, 40);
		const k = Math.min(bw / Math.max(x1 - x0, 1), bh / Math.max(y1 - y0, 1), maxK);
		return {
			k,
			x: box.left + bw / 2 - ((x0 + x1) / 2) * k,
			y: box.top + bh / 2 - ((y0 + y1) / 2) * k
		};
	}

	toWorld(sx: number, sy: number): [number, number] {
		return [(sx - this.cam.x) / this.cam.k, (sy - this.cam.y) / this.cam.k];
	}

	/** Zoom by `factor` about the screen point (sx, sy). */
	zoomAt(sx: number, sy: number, factor: number, min: number, max: number): void {
		const k = Math.min(Math.max(this.cam.k * factor, min), max);
		const [wx, wy] = this.toWorld(sx, sy);
		this.cam = { k, x: sx - wx * k, y: sy - wy * k };
	}

	/** The node under a screen point, with `slop` px of grace for a finger. */
	pick(sx: number, sy: number, slop: number): SimNode<N> | null {
		const [wx, wy] = this.toWorld(sx, sy);
		const k = this.cam.k;
		let best: SimNode<N> | null = null;
		let bd = Infinity;
		for (const s of this.nodes) {
			if (!this.visible(s)) continue;
			const d = Math.hypot(s.x - wx, s.y - wy);
			if (d < Math.max(s.r, 2 / k) + slop / k && d < bd) {
				bd = d;
				best = s;
			}
		}
		return best;
	}

	clearTextCache(): void {
		this.widths.clear();
	}

	draw(ctx: CanvasRenderingContext2D): void {
		const P = this.palette;
		const { dpr, width: W, height: H } = this;
		const { k, x: tx, y: ty } = this.cam;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, W, H);
		if (!P) return;

		const chosen = this.selected && this.visible(this.selected) ? this.selected : null;
		// A route holds the picture until the pointer rests on a node.
		const route = !this.hovered && this.routeNodes.size > 0;
		const focus = route ? null : (this.hovered ?? chosen);
		const near = focus ? this.adj.get(focus) : undefined;
		const dim = !!focus || route;
		const lit = (s: SimNode<N>) => (route ? this.routeNodes.has(s) : !focus || s === focus || !!near?.has(s));
		const margin = 40 / k;
		const vx0 = -tx / k - margin;
		const vy0 = -ty / k - margin;
		const vx1 = (W - tx) / k + margin;
		const vy1 = (H - ty) / k + margin;
		const onScreen = (s: SimNode<N>) => s.x > vx0 && s.x < vx1 && s.y > vy0 && s.y < vy1;
		const rad = (s: SimNode<N>) => Math.max(s.r, 1.8 / k);

		ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * tx, dpr * ty);
		ctx.lineCap = 'butt';
		ctx.lineJoin = 'round';

		const shown: SimEdge<N>[] = [];
		for (const e of this.edges) {
			const a = e.source;
			const b = e.target;
			if (!this.visible(a) || !this.visible(b)) continue;
			if (
				Math.max(a.x, b.x) < vx0 ||
				Math.min(a.x, b.x) > vx1 ||
				Math.max(a.y, b.y) < vy0 ||
				Math.min(a.y, b.y) > vy1
			)
				continue;
			shown.push(e);
		}
		// Detail follows how many edges are on screen, not the zoom: past a
		// thousand, curves read as straight lines and arrowheads as noise, and
		// both cost more to fill than the rest of the frame.
		const curved = shown.length < 1200;

		// Edges: one batched path for the rest, one per colour for the lit ones.
		const rest = new Path2D();
		const restDashed = new Path2D();
		const restHeads = new Path2D();
		const litPaths = new Map<string, { line: Path2D; dashed: Path2D; head: Path2D }>();
		const edgeLabels: SimEdge<N>[] = [];
		const heads = this.directed && (shown.length < 500 || dim);
		// A hub's relations crowd its own spokes; past a dozen the card lists them instead.
		const relationWords = focus ? (this.adj.get(focus)?.size ?? 0) <= 12 : shown.length < 300;
		for (const e of shown) {
			const a = e.source;
			const b = e.target;
			const hot = route ? this.routeEdges.has(e) : !!focus && (a === focus || b === focus);
			const dashed = e.edge.style === 'dashed';
			let path = dashed ? restDashed : rest;
			let head = restHeads;
			if (hot) {
				const colour = route ? P.ink : this.colour(a === focus ? b : a);
				let p = litPaths.get(colour);
				if (!p) litPaths.set(colour, (p = { line: new Path2D(), dashed: new Path2D(), head: new Path2D() }));
				path = dashed ? p.dashed : p.line;
				head = p.head;
			}
			const [cx, cy] = curved || hot ? this.control(e) : [(a.x + b.x) / 2, (a.y + b.y) / 2];
			path.moveTo(a.x, a.y);
			if (curved || hot) path.quadraticCurveTo(cx, cy, b.x, b.y);
			else path.lineTo(b.x, b.y);
			if (heads && (hot || !dim)) this.arrow(head, cx, cy, b, rad(b), k);
			if (e.edge.label && (route ? hot : relationWords && (hot || !focus))) edgeLabels.push(e);
		}
		ctx.strokeStyle = P.edge;
		ctx.fillStyle = P.edge;
		ctx.globalAlpha = dim ? 0.07 : Math.min(0.65, 0.12 + 0.35 * k);
		ctx.lineWidth = 1 / k;
		ctx.stroke(rest);
		ctx.setLineDash([5 / k, 4 / k]);
		ctx.stroke(restDashed);
		ctx.setLineDash([]);
		ctx.fill(restHeads);
		ctx.globalAlpha = 0.95;
		ctx.lineWidth = (route ? 2.75 : 1.75) / k;
		for (const [colour, p] of litPaths) {
			ctx.strokeStyle = colour;
			ctx.fillStyle = colour;
			ctx.stroke(p.line);
			ctx.setLineDash([6 / k, 4 / k]);
			ctx.stroke(p.dashed);
			ctx.setLineDash([]);
			ctx.fill(p.head);
		}

		// Nodes: dimmed first, then lit, each batched by kind. A dot too small to
		// overlap its neighbour visibly skips the ground-coloured halo.
		const halo = k >= 0.5 ? 1.4 / k : 0;
		for (const pass of [false, true]) {
			if (pass === false && !dim) continue;
			const groups = new Map<string, Path2D>();
			for (const s of this.nodes) {
				if (!this.visible(s) || !onScreen(s) || lit(s) !== pass) continue;
				const kind = s.node.kind;
				let p = groups.get(kind);
				if (!p) groups.set(kind, (p = new Path2D()));
				this.shape(p, this.shapes.get(kind) ?? 'circle', s.x, s.y, rad(s));
			}
			ctx.globalAlpha = pass ? 1 : 0.12;
			ctx.lineWidth = halo;
			ctx.strokeStyle = P.ground;
			for (const [kind, p] of groups) {
				ctx.fillStyle = P.kinds.get(kind) ?? P.fallback;
				ctx.fill(p);
				if (halo) ctx.stroke(p);
			}
		}
		ctx.globalAlpha = 1;

		// Rings: emphasis (double, in the kind's colour), search hits, the selection.
		for (const s of this.nodes) {
			if (!this.visible(s) || !onScreen(s)) continue;
			const ring = s === this.selected || s === focus;
			const onRoute = route && this.routeNodes.has(s);
			if (!s.node.emphasis && !ring && !onRoute && !this.matches.has(s)) continue;
			const r = rad(s);
			const shape = this.shapes.get(s.node.kind) ?? 'circle';
			ctx.globalAlpha = lit(s) ? 1 : 0.2;
			if (ring) {
				const glow = new Path2D();
				this.shape(glow, shape, s.x, s.y, r + 7 / k);
				ctx.fillStyle = this.colour(s);
				ctx.globalAlpha = 0.22;
				ctx.fill(glow);
				ctx.globalAlpha = 1;
			}
			const p = new Path2D();
			this.shape(p, shape, s.x, s.y, r + 3.5 / k);
			ctx.lineWidth = (ring ? 2 : 1.4) / k;
			ctx.strokeStyle = ring || onRoute || this.matches.has(s) ? P.ink : this.colour(s);
			ctx.stroke(p);
		}
		ctx.globalAlpha = 1;

		this.labels(ctx, P, focus, near, edgeLabels, route, onScreen, rad);
	}

	colour(s: SimNode<N>): string {
		return this.palette?.kinds.get(s.node.kind) ?? this.palette?.fallback ?? 'currentColor';
	}

	private control(e: SimEdge<N>): [number, number] {
		const a = e.source;
		const b = e.target;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy) || 1;
		const curve = Math.min(len * 0.1, 22) * e.bend;
		return [(a.x + b.x) / 2 - (dy / len) * curve, (a.y + b.y) / 2 + (dx / len) * curve];
	}

	private arrow(p: Path2D, cx: number, cy: number, b: SimNode<N>, r: number, k: number): void {
		const dx = b.x - cx;
		const dy = b.y - cy;
		const len = Math.hypot(dx, dy) || 1;
		const ux = dx / len;
		const uy = dy / len;
		const tipX = b.x - ux * (r + 2 / k);
		const tipY = b.y - uy * (r + 2 / k);
		const size = 7 / k;
		p.moveTo(tipX, tipY);
		p.lineTo(tipX - ux * size - uy * size * 0.5, tipY - uy * size + ux * size * 0.5);
		p.lineTo(tipX - ux * size + uy * size * 0.5, tipY - uy * size - ux * size * 0.5);
		p.closePath();
	}

	private shape(p: Path2D, shape: GraphShape, x: number, y: number, r: number): void {
		if (shape === 'square') {
			const h = r * 0.89;
			p.rect(x - h, y - h, h * 2, h * 2);
		} else if (shape === 'diamond') {
			const h = r * 1.22;
			p.moveTo(x, y - h);
			p.lineTo(x + h, y);
			p.lineTo(x, y + h);
			p.lineTo(x - h, y);
			p.closePath();
		} else if (shape === 'triangle') {
			const h = r * 1.3;
			p.moveTo(x, y - h);
			p.lineTo(x + h * 0.866, y + h * 0.5);
			p.lineTo(x - h * 0.866, y + h * 0.5);
			p.closePath();
		} else {
			p.moveTo(x + r, y);
			p.arc(x, y, r, 0, Math.PI * 2);
		}
	}

	private measure(ctx: CanvasRenderingContext2D, font: string, text: string): number {
		const key = `${font}|${text}`;
		let w = this.widths.get(key);
		if (w === undefined) {
			ctx.font = font;
			w = ctx.measureText(text).width;
			this.widths.set(key, w);
		}
		return w;
	}

	/** Reserve a screen box unless it overlaps one already reserved. */
	private claim(x0: number, y0: number, x1: number, y1: number): boolean {
		const c0 = Math.floor(x0 / CELL);
		const c1 = Math.floor(x1 / CELL);
		const r0 = Math.floor(y0 / CELL);
		const r1 = Math.floor(y1 / CELL);
		const b = this.boxes;
		for (let c = c0; c <= c1; c++) {
			for (let r = r0; r <= r1; r++) {
				for (const i of this.grid.get(c * 4096 + r) ?? []) {
					if (x0 < b[i + 2]! && x1 > b[i]! && y0 < b[i + 3]! && y1 > b[i + 1]!) return false;
				}
			}
		}
		const i = b.length;
		b.push(x0, y0, x1, y1);
		for (let c = c0; c <= c1; c++) {
			for (let r = r0; r <= r1; r++) {
				const key = c * 4096 + r;
				const cell = this.grid.get(key);
				if (cell) cell.push(i);
				else this.grid.set(key, [i]);
			}
		}
		return true;
	}

	private labels(
		ctx: CanvasRenderingContext2D,
		P: ScenePalette,
		focus: SimNode<N> | null,
		near: Set<SimNode<N>> | undefined,
		edgeLabels: SimEdge<N>[],
		route: boolean,
		onScreen: (s: SimNode<N>) => boolean,
		rad: (s: SimNode<N>) => number
	): void {
		const { k, x: tx, y: ty } = this.cam;
		const { dpr, width: W, height: H } = this;
		this.grid.clear();
		this.boxes = [];
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.textAlign = 'center';
		ctx.lineJoin = 'round';
		ctx.globalAlpha = 1;

		// The discs a label must not cover: under a focus, the lit ones; at rest,
		// only nodes drawn large. A haloed name reads fine across small dots.
		for (const s of this.nodes) {
			if (!this.visible(s) || !onScreen(s)) continue;
			const r = rad(s) * k;
			if (focus ? s !== focus && !near?.has(s) : r < 8) continue;
			const sx = tx + s.x * k;
			const sy = ty + s.y * k;
			this.claim(sx - r, sy - r, sx + r, sy + r);
		}

		const order: SimNode<N>[] = [];
		if (focus) {
			order.push(focus);
			const ring = [...(near ?? [])].sort((p, q) => q.degree - p.degree);
			order.push(...ring);
		} else {
			if (this.selected) order.push(this.selected);
			if (route) order.push(...this.routeNodes);
			order.push(...this.matches);
			if (!route) order.push(...this.ranked);
		}
		const seen = new Set<SimNode<N>>();
		const quota = Math.ceil((W * H) / LABEL_AREA);
		let placed = 0;
		let tries = 0;
		const body = `500 12px ${P.font}`;
		const strong = `600 13px ${P.font}`;
		for (const s of order) {
			if (placed >= MAX_LABELS || tries >= MAX_LABEL_TRIES) break;
			if (seen.has(s) || !this.visible(s) || !onScreen(s)) continue;
			seen.add(s);
			tries++;
			const text = clip(s.node.label);
			const prominent =
				s === focus || s === this.selected || !!s.node.emphasis || (route && this.routeNodes.has(s));
			if (!focus && placed >= quota && rad(s) * k < 7 && !prominent && !this.matches.has(s)) continue;
			const font = prominent ? strong : body;
			const w = this.measure(ctx, font, text);
			const h = prominent ? 15 : 14;
			const sx = tx + s.x * k;
			const r = rad(s) * k;
			if (sx + w / 2 < 0 || sx - w / 2 > W) continue;
			// Below the node, else above it; the focused or selected name is drawn
			// whatever it lands on, since it is the one the reader is looking for.
			const below = ty + s.y * k + r + 4;
			const above = ty + s.y * k - r - 4 - h;
			const fits = (y: number) => this.claim(sx - w / 2 - 3, y - 2, sx + w / 2 + 3, y + h + 2);
			const sy = fits(below) ? below : fits(above) ? above : s === focus || s === this.selected || (route && this.routeNodes.has(s)) ? below : null;
			if (sy === null || sy > H || sy + h < 0) continue;
			this.text(ctx, font, text, sx, sy, 'top', P.ink, P.ground);
			placed++;
		}

		const small = `600 10px ${P.font}`;
		let edgesPlaced = 0;
		for (const e of edgeLabels) {
			if (edgesPlaced >= MAX_EDGE_LABELS) break;
			const label = e.edge.label;
			if (!label) continue;
			const [cx, cy] = this.control(e);
			const mx = tx + (0.25 * e.source.x + 0.5 * cx + 0.25 * e.target.x) * k;
			const my = ty + (0.25 * e.source.y + 0.5 * cy + 0.25 * e.target.y) * k;
			if (mx < 0 || mx > W || my < 0 || my > H) continue;
			const text = clip(label);
			const w = this.measure(ctx, small, text);
			if (!this.claim(mx - w / 2 - 3, my - 7, mx + w / 2 + 3, my + 7)) continue;
			const hot = route || (!!focus && (e.source === focus || e.target === focus));
			this.text(ctx, small, text, mx, my, 'middle', hot ? P.ink : P.inkSoft, P.ground);
			edgesPlaced++;
		}
	}

	private text(
		ctx: CanvasRenderingContext2D,
		font: string,
		text: string,
		x: number,
		y: number,
		baseline: CanvasTextBaseline,
		fill: string,
		halo: string
	): void {
		ctx.font = font;
		ctx.textBaseline = baseline;
		ctx.lineWidth = 3.5;
		ctx.strokeStyle = halo;
		ctx.strokeText(text, x, y);
		ctx.fillStyle = fill;
		ctx.fillText(text, x, y);
	}
}

function clip(text: string): string {
	return text.length > 32 ? `${text.slice(0, 31)}…` : text;
}
