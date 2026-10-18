/**
 * An OSINT-shaped graph at a real size: corporate groups of organisations, the
 * people who direct, work for and own them, and the sources that mention them.
 * Seeded, so every run and every screenshot draws the same graph. Every name is
 * made of invented syllables.
 */
import type { GraphEdge, GraphKind, GraphNode } from '../dist/components/ui/graph-canvas/types.js';

export const KINDS: GraphKind[] = [
	{ id: 'person', label: 'People', color: 'var(--ds-color-primary)', shape: 'circle' },
	{ id: 'organisation', label: 'Organisations', color: 'var(--ds-color-status-success)', shape: 'square' },
	{ id: 'source', label: 'Sources', color: 'var(--ds-color-status-warning)', shape: 'diamond' }
];

function prng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const FIRST = ['Ar', 'Bel', 'Cor', 'Dar', 'El', 'Fen', 'Gal', 'Hal', 'Is', 'Jor', 'Kel', 'Lor', 'Mir', 'Nor', 'Os', 'Per', 'Quin', 'Ros', 'Sel', 'Tam', 'Ul', 'Ven', 'Wyn', 'Yor', 'Zan'];
const END = ['a', 'en', 'is', 'o', 'ia', 'an', 'el', 'ie', 'ys', 'ara', 'eth', 'wyn'];
const SUR = ['Ash', 'Brack', 'Carr', 'Dun', 'Ell', 'Fenn', 'Grav', 'Hollin', 'Ivers', 'Kest', 'Lang', 'Morr', 'Nash', 'Pell', 'Quar', 'Rook', 'Stan', 'Thorn', 'Vael', 'Wren'];
const SURX = ['ford', 'wick', 'ley', 'ton', 'by', 'well', 'more', 'ham', 'ridge', 'croft', 'shaw', 'den'];
const ORG = ['Var', 'Quel', 'Ostr', 'Bren', 'Kall', 'Tess', 'Morv', 'Aud', 'Zeph', 'Corr', 'Lum', 'Hesk', 'Brav', 'Sorr', 'Wend'];
const ORGX = ['row', 'lin', 'ane', 'ex', 'ora', 'ith', 'ant', 'ell', 'iva', 'onn'];
const TRADE = ['Holdings', 'Logistics', 'Capital', 'Minerals', 'Pty Ltd', 'Trust', 'Partners', 'Group', 'Services', 'Ventures', 'Shipping', 'Advisory'];
const SOURCE = ['Register extract', 'Court listing', 'News report', 'Annual filing', 'Tender award', 'Land title', 'Social post', 'Leaked memo'];

export function osint(total = 3000, seed = 7): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const rand = prng(seed);
	const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];
	const used = new Set<string>();
	const unique = (make: () => string) => {
		for (let i = 0; i < 20; i++) {
			const s = make();
			if (!used.has(s)) {
				used.add(s);
				return s;
			}
		}
		const s = `${make()} ${used.size}`;
		used.add(s);
		return s;
	};

	const nOrgs = Math.round(total * 0.12);
	const nSources = Math.round(total * 0.16);
	const nPeople = total - nOrgs - nSources;
	const groups = Math.max(1, Math.round(nOrgs / 9));

	const orgs: { id: string; group: number }[] = [];
	for (let i = 0; i < nOrgs; i++) {
		const id = `o${i}`;
		const group = i < groups ? i : Math.floor(rand() * groups);
		orgs.push({ id, group });
		nodes.push({
			id,
			kind: 'organisation',
			label: unique(() => `${pick(ORG)}${pick(ORGX)} ${pick(TRADE)}`),
			description: `ABN ${String(10_000_000_000 + Math.floor(rand() * 89_999_999_999))}`
		});
		if (i >= groups) edges.push({ source: id, target: `o${group}`, label: 'subsidiary of' });
	}
	const byGroup = new Map<number, string[]>();
	for (const o of orgs) byGroup.set(o.group, [...(byGroup.get(o.group) ?? []), o.id]);

	const people: { id: string; group: number }[] = [];
	const crew = new Map<number, string[]>();
	for (let i = 0; i < nPeople; i++) {
		const id = `p${i}`;
		// Groups are unequal in size, as real ones are: a few large, most small.
		const group = Math.floor(Math.pow(rand(), 1.8) * groups);
		people.push({ id, group });
		crew.set(group, [...(crew.get(group) ?? []), id]);
		nodes.push({
			id,
			kind: 'person',
			label: unique(() => `${pick(FIRST)}${pick(END)} ${pick(SUR)}${pick(SURX)}`),
			emphasis: i < 3
		});
		const mine = byGroup.get(group) ?? [`o${group}`];
		const roles = rand() < 0.15 ? 2 : 1;
		for (let r = 0; r < roles; r++) {
			const roll = rand();
			edges.push({
				source: id,
				target: pick(mine),
				label: roll < 0.18 ? 'director of' : roll < 0.3 ? 'shareholder of' : 'employee of'
			});
		}
		if (rand() < 0.2) {
			// Mostly someone in the same group; now and then a bridge to another.
			const other = rand() < 0.85 ? pick(crew.get(group) ?? []) : pick(people).id;
			if (other !== id) edges.push({ source: id, target: other, label: 'associate of' });
		}
	}

	for (let i = 0; i < nSources; i++) {
		const id = `s${i}`;
		const kind = pick(SOURCE);
		nodes.push({ id, kind: 'source', label: `${kind} ${1000 + i}`, description: `${kind}, retrieved 2026` });
		const group = Math.floor(Math.pow(rand(), 1.5) * groups);
		const pool = [...(byGroup.get(group) ?? []), ...(crew.get(group) ?? [])];
		const mentions = 1 + Math.floor(rand() * 4);
		const seen = new Set<string>();
		for (let m = 0; m < mentions && pool.length; m++) {
			const target = rand() < 0.95 ? pick(pool) : pick(people).id;
			if (seen.has(target)) continue;
			seen.add(target);
			edges.push({ source: id, target, label: 'mentions' });
		}
	}
	return { nodes, edges };
}
