// The change pipeline's refusal (its pnpm leg runs this in a factory app's frontend): a
// change that redraws src/ lands with the layout gate's judgement of the tree it lands, in
// .layout-gate-record.json, which keeps each route's latest verdict and the tree it judged.
//   An app's own change: every route it redraws is judged on this tree, and every route
//     judged on this tree ships.
//   A factory update (.copier-answers.yml's _commit moved): SHELL_ROUTES and any factory
//     page it changed are judged on this tree, and no route the base's record judged ship
//     on the same prompt now judges fix. A route already at fix, never judged, or judged on
//     another prompt (a stricter judge is not a regression the update caused) does not hold it.
//   No base (CI with no CHANGE_BASE): the tree as it stands carries a judgement.
// A change that redraws nothing is never asked.
//   CHANGE_BASE  the commit the change is measured from (the pipeline's plan); by hand, the
//                merge-base with origin/main.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { RECORD, drawnFiles, routesFromChanges, treeKey } from './layout-gate.mjs';

// What a factory update is judged on, whatever it changed: the home and the factory's own
// settings page, both drawn in the shell. Six judge calls an app.
export const SHELL_ROUTES = ['/', '/settings'];
const ANSWERS = '../.copier-answers.yml';

const ask = (routes) =>
	`run \`pnpm layout-gate ${routes.join(' ') || '<the routes that show it>'}\` and commit ${RECORD}`;
const list = (routes) => `${routes.join(', ')} ${routes.length > 1 ? 'judge' : 'judges'}`;

/** Why the change at `now` (path → blob) cannot land over `was`, or null when it can.
 * `before` is the base's record; `update` says the factory's _commit moved. */
export function refusal(now, was, record, { update = false, before = null } = {}) {
	const changed = [...now].filter(([p, blob]) => was.get(p) !== blob).map(([p]) => p);
	if (!changed.length && now.size === was.size) return null;
	const tree = treeKey(now);
	const { routes } = routesFromChanges(changed);
	const want = update ? [...new Set([...SHELL_ROUTES, ...routes])].sort() : routes;
	if (!record) return `src/ is redrawn and no judgement of it is committed: ${ask(want)}.`;
	const judged = Object.entries(record.routes ?? {}).filter(([, r]) => r.tree === tree);
	if (!judged.length)
		return `${RECORD} judged another tree than this one (src/ changed after it was judged): ${ask(want)}.`;
	const unjudged = want.filter((r) => record.routes[r]?.tree !== tree);
	if (unjudged.length)
		return `${unjudged.join(', ')} ${update ? `show${unjudged.length > 1 ? '' : 's'} this factory update` : 'changed'} and ${RECORD} does not judge ${unjudged.length > 1 ? 'them' : 'it'} on this tree: ${ask(unjudged)}.`;
	const fix = judged.filter(([, r]) => r.verdict !== 'ship').map(([p]) => p);
	if (!update) {
		if (fix.length)
			return `${list(fix)} fix on this tree, and an app's own redraw lands only when every route it shows on ships; the record names each sample's call.`;
		return null;
	}
	const fell = fix.filter((p) => {
		const was = before?.routes?.[p];
		return was?.verdict === 'ship' && !!was.prompt && was.prompt === record.routes[p].prompt;
	});
	if (fell.length)
		return `${list(fell)} fix after this factory update and judged ship before it, on the same prompt; the update lands when ${fell.length > 1 ? 'they ship' : 'it ships'} again.`;
	return null;
}

/** Why a tree with no base to measure it from cannot land, or null when it is judged. */
export function unmeasured(now, record) {
	const tree = treeKey(now);
	if (Object.values(record?.routes ?? {}).some((r) => r.tree === tree)) return null;
	return `no base to measure the change from (CHANGE_BASE is empty), and ${RECORD} judges no route on the drawn tree as it stands: ${ask(SHELL_ROUTES)}.`;
}

function git(...args) {
	return spawnSync('git', args, { encoding: 'utf8' });
}

const factoryCommit = (text) => /^_commit:\s*(\S+)/m.exec(text ?? '')?.[1] ?? null;
const recordAt = (base) => {
	const r = git('show', `${base}:./${RECORD}`);
	return r.status === 0 ? JSON.parse(r.stdout) : null;
};

function main() {
	const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : null;
	const base =
		process.env.CHANGE_BASE ||
		(process.env.CI ? '' : git('merge-base', 'origin/main', 'HEAD').stdout.trim() || 'HEAD');
	let why;
	if (!base) why = unmeasured(drawnFiles(), record);
	else {
		if (git('cat-file', '-e', `${base}^{commit}`).status !== 0) {
			const f = git('fetch', '--no-tags', '--depth=1', 'origin', base);
			if (f.status !== 0) {
				console.error(`layout gate: cannot fetch the base ${base}: ${f.stderr.trim()}`);
				return 1;
			}
		}
		const was = factoryCommit(git('show', `${base}:${ANSWERS}`).stdout);
		const now = existsSync(ANSWERS) ? factoryCommit(readFileSync(ANSWERS, 'utf8')) : null;
		why = refusal(drawnFiles(), drawnFiles(base), record, {
			update: was !== now,
			before: recordAt(base)
		});
	}
	if (why) {
		console.error(`layout gate: ${why}`);
		return 1;
	}
	console.log('layout gate: src/ unchanged, or judged as it lands.');
	return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
