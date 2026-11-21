// The change pipeline's refusal (its pnpm leg runs this in a factory app's frontend): a
// change that redraws src/ lands with the layout gate's passing judgement of the tree it
// lands, in .layout-gate-record.json, covering every route whose page it changed. A change
// that redraws nothing is never asked.
//   CHANGE_BASE  the commit the change is measured from (the pipeline's plan); by hand, the
//                merge-base with origin/main.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { RECORD, drawnFiles, routesFromChanges, treeKey } from './layout-gate.mjs';

/** Why the change at `now` (path → blob) cannot land over `was`, or null when it can. */
export function refusal(now, was, record) {
	const changed = [...now].filter(([p, blob]) => was.get(p) !== blob).map(([p]) => p);
	if (!changed.length && now.size === was.size) return null;
	const ask = (routes) =>
		`run \`pnpm layout-gate ${routes.join(' ') || '<the routes that show it>'}\` and commit ${RECORD}`;
	const { routes } = routesFromChanges(changed);
	if (!record) return `src/ is redrawn and no judgement of it is committed: ${ask(routes)}.`;
	if (record.tree !== treeKey(now))
		return `${RECORD} judged another tree than this one (src/ changed after it was judged): ${ask(routes)}.`;
	const unjudged = routes.filter((r) => !(r in (record.routes ?? {})));
	if (unjudged.length)
		return `${unjudged.join(', ')} changed and ${RECORD} does not judge ${unjudged.length > 1 ? 'them' : 'it'}: ${ask(unjudged)}.`;
	return null;
}

function git(...args) {
	return spawnSync('git', args, { encoding: 'utf8' });
}

function main() {
	const base =
		process.env.CHANGE_BASE ||
		(process.env.CI ? '' : git('merge-base', 'origin/main', 'HEAD').stdout.trim() || 'HEAD');
	if (!base) {
		console.log('layout gate: no base to measure the change from, so nothing ships; not asked.');
		return 0;
	}
	if (git('cat-file', '-e', `${base}^{commit}`).status !== 0) {
		const f = git('fetch', '--no-tags', '--depth=1', 'origin', base);
		if (f.status !== 0) {
			console.error(`layout gate: cannot fetch the base ${base}: ${f.stderr.trim()}`);
			return 1;
		}
	}
	const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : null;
	const why = refusal(drawnFiles(), drawnFiles(base), record);
	if (why) {
		console.error(`layout gate: ${why}`);
		return 1;
	}
	console.log('layout gate: src/ unchanged, or judged as it lands.');
	return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
