/**
 * Read a live household app's real navigation out of its rendered shell.
 *
 * WHY THIS SHAPE. The lab needs real structure, not structure invented by
 * whoever wrote its fixtures — every module of the Godswood profile was wrong
 * before this was run. But the lab cannot IMPORT an app's nav config: apps
 * depend on @poodle64/ui, so the design system reaching into its own consumers
 * would invert the dependency. Data may flow app -> lab; code may not.
 *
 * It is a snippet rather than a harness because the only hard part is auth.
 * Every app sits behind the identity provider, so a headless script would need
 * a seeded session, a secret, and a place to keep it — machinery worth more
 * than the thirty lines below. Pasted into a console you are already signed
 * into, or run through the browser-driver MCP against a session that is, it
 * needs none of that.
 *
 * USE
 *   1. Open the app, signed in, on any route.
 *   2. Paste this whole file into the browser console.
 *   3. Copy the printed object into src/lib/profiles.ts.
 *
 * It reads the SHIPPED AppShell's markup, so one extractor serves every app.
 */
(() => {
	const rail = document.querySelector('aside');
	if (!rail)
		return console.error('No rail found — is this an AppShell app, and is the rail expanded?');

	const rows = [...rail.querySelectorAll('a[href]')]
		.map((a) => {
			const lines = a.innerText.trim().split('\n');
			return {
				label: lines[0],
				href: a.getAttribute('href'),
				count: (lines[1] || '').trim() || undefined
			};
		})
		.filter((r) => r.label && r.href);

	// A module is a top-level route; anything deeper belongs to the module above.
	const depth = (h) => h.split('/').filter(Boolean).length;
	const modules = [];
	const selfChild = [];

	for (const r of rows) {
		if (depth(r.href) <= 1) {
			const owner = modules.at(-1);
			// A child whose href IS the module's own href is the module's dashboard
			// listed as a child of itself. Counted, never nested: a module's root is
			// its dashboard, so it does not need a sub-route to reach itself.
			if (owner && r.href === owner.href) {
				selfChild.push(`${owner.label} › ${r.label}`);
				continue;
			}
			modules.push({ label: r.label, href: r.href, peers: [] });
		} else if (modules.length) {
			modules.at(-1).peers.push({ label: r.label, ...(r.count ? { count: r.count } : {}) });
		}
	}

	if (selfChild.length) {
		console.warn(
			`${selfChild.length} module(s) list their own dashboard as a child of themselves — ` +
				`a nav row that navigates nowhere new:\n  ${selfChild.join('\n  ')}`
		);
	}

	const profile = {
		id: location.hostname.split('.')[0],
		name: document.title.split('—').pop().trim(),
		sections: modules.map((m) => ({
			label: m.label,
			crumb: [m.label],
			content: 'dashboard',
			...(m.peers.length ? { peers: m.peers } : {})
		}))
	};

	console.log(JSON.stringify(profile, null, '\t'));
	return profile;
})();
