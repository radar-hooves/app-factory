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
// A factory update no agent committed a record for (Renovate's) is judged here, on a runner
// that holds the judge's key (KEY_FILE; absent, nothing is judged and the rules above stand).
// The verdicts are kept on the runner host, in STORE by repo and drawn tree, never in
// GitHub's storage or the repo: the push after the merge reads the same judgement of the same
// tree instead of asking again, and no job holds a credential that can push.
// A change that redraws nothing is never asked.
//   CHANGE_BASE  the commit the change is measured from (the pipeline's plan); by hand, the
//                merge-base with origin/main.
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { RECORD, drawnFiles, routesFromChanges, treeKey } from './layout-gate.mjs';

// What a factory update is judged on, whatever it changed: the home and the factory's own
// settings page, both drawn in the shell. Six judge calls an app.
export const SHELL_ROUTES = ['/', '/settings'];
const ANSWERS = '../.copier-answers.yml';
const STORE = process.env.LAYOUT_GATE_STORE ?? '/var/lib/github-runner-home/shared/layout-gate';
const KEY_FILE = process.env.LAYOUT_GATE_KEY_FILE ?? '/etc/litellm/layout-gate';
const GATEWAY = process.env.LAYOUT_GATE_URL ?? 'http://172.38.0.8:4000';

const ask = (routes) =>
	`run \`pnpm layout-gate ${routes.join(' ') || '<the routes that show it>'}\` and commit ${RECORD}`;
const list = (routes) => `${routes.join(', ')} ${routes.length > 1 ? 'judge' : 'judges'}`;

/** What a factory update is judged on: the shell, and every factory page it changed. */
export function routesToJudge(now, was, update) {
	const changed = [...now].filter(([p, blob]) => was.get(p) !== blob).map(([p]) => p);
	const { routes } = routesFromChanges(changed);
	return update ? [...new Set([...SHELL_ROUTES, ...routes])].sort() : routes;
}

/** Why the change at `now` (path → blob) cannot land over `was`, or null when it can.
 * `before` is the base's record; `update` says the factory's _commit moved. */
export function refusal(now, was, record, { update = false, before = null } = {}) {
	const changed = [...now].filter(([p, blob]) => was.get(p) !== blob).map(([p]) => p);
	if (!changed.length && now.size === was.size) return null;
	const tree = treeKey(now);
	const want = routesToJudge(now, was, update);
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

const keyReadable = () => {
	try {
		accessSync(KEY_FILE, constants.R_OK);
		return true;
	} catch {
		return false;
	}
};
const storeFile = (repo, tree) => join(STORE, repo, `${tree}.json`);

/** The record with what this runner host judged of this tree laid beside it. */
function withStored(record, repo, tree) {
	if (!repo) return record;
	let kept;
	try {
		kept = JSON.parse(readFileSync(storeFile(repo, tree), 'utf8'));
	} catch {
		return record;
	}
	const routes = { ...record?.routes };
	for (const [p, r] of Object.entries(kept.routes ?? {})) if (routes[p]?.tree !== tree) routes[p] = r;
	return { ...record, routes };
}

/** Judge `routes` on this runner with the layout gate's own key; keep the verdicts in STORE. */
function judgeHere(routes, repo, tree) {
	console.log(`layout gate: judging ${routes.join(', ')} on this runner.`);
	const key = readFileSync(KEY_FILE, 'utf8').trim();
	spawnSync('pnpm', ['layout-gate', ...routes], {
		stdio: 'inherit',
		env: { ...process.env, LITELLM_URL: GATEWAY, LITELLM_VIRTUAL_KEY: key }
	});
	const record = existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : null;
	const fresh = Object.entries(record?.routes ?? {}).filter(([, r]) => r.tree === tree);
	if (fresh.length) {
		try {
			mkdirSync(dirname(storeFile(repo, tree)), { recursive: true });
			writeFileSync(storeFile(repo, tree), `${JSON.stringify({ routes: Object.fromEntries(fresh) })}\n`);
		} catch (e) {
			console.error(`layout gate: the verdicts are not kept (${e.message}); the push will judge again.`);
		}
	}
	return record;
}

function main() {
	const repo = process.env.CI ? process.env.GITHUB_REPOSITORY : '';
	const now = drawnFiles();
	const tree = treeKey(now);
	let record = withStored(
		existsSync(RECORD) ? JSON.parse(readFileSync(RECORD, 'utf8')) : null,
		repo,
		tree
	);
	const base =
		process.env.CHANGE_BASE ||
		(process.env.CI ? '' : git('merge-base', 'origin/main', 'HEAD').stdout.trim() || 'HEAD');
	let why;
	if (!base) why = unmeasured(now, record);
	else {
		if (git('cat-file', '-e', `${base}^{commit}`).status !== 0) {
			const f = git('fetch', '--no-tags', '--depth=1', 'origin', base);
			if (f.status !== 0) {
				console.error(`layout gate: cannot fetch the base ${base}: ${f.stderr.trim()}`);
				return 1;
			}
		}
		const was = factoryCommit(git('show', `${base}:${ANSWERS}`).stdout);
		const update =
			was !== (existsSync(ANSWERS) ? factoryCommit(readFileSync(ANSWERS, 'utf8')) : null);
		const was_ = drawnFiles(base);
		const before = recordAt(base);
		const redrawn = now.size !== was_.size || [...now].some(([p, blob]) => was_.get(p) !== blob);
		const missing = routesToJudge(now, was_, update).filter((r) => record?.routes?.[r]?.tree !== tree);
		if (repo && update && redrawn && missing.length && keyReadable()) {
			record = withStored(judgeHere(missing, repo, tree), repo, tree);
		}
		why = refusal(now, was_, record, { update, before });
	}
	if (why) {
		console.error(`layout gate: ${why}`);
		return 1;
	}
	console.log('layout gate: src/ unchanged, or judged as it lands.');
	return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
