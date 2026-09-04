/**
 * Shell-lab app profiles.
 *
 * Real household app names, nav trees and copy, transcribed from the live apps
 * on 04/09/2026. Tracked, because this repo is private; the lab still falls
 * back to a neutral demo profile without this file, so the tool stays usable
 * on its own.
 *
 * Chrome only. No financial values, account identifiers or household member
 * names belong here — the shape of an app's navigation is not its data, and
 * the pre-commit PII gate blocks a real name regardless of repo visibility.
 * Identity renders as a role. Name LENGTH is a real layout variable, so vary
 * `who` by hand when testing how the chip behaves against a long one.
 *
 * Add an app by copying a block. Fields: id, name, mark, hue (OKLCH hue for
 * --ds-color-primary), initials, who, searchLabel, nav[{group,items[]}],
 * crumb[], eyebrow, peers[], scope[], title, subtitle, actions[].
 */
window.SHELL_LAB_APPS = [
	{
		id: 'godswood',
		name: 'Godswood',
		mark: '◈',
		hue: 150,
		initials: 'PG',
		who: 'Operator',
		searchLabel: 'Search Godswood…',
		nav: [
			{
				group: null,
				items: [
					{ label: 'Home', icon: '⌂' },
					{ label: 'Essentialism', icon: '▤' },
					{ label: 'Groceries', icon: '▦' },
					{ label: 'Budget', icon: '◎' },
					{ label: 'Property', icon: '⌂' },
					{ label: 'Net Worth', icon: '◐' },
					{
						label: 'Securities',
						icon: '▥',
						active: true,
						children: ['Overview', 'Investing', 'Trading', 'Live', 'P&L', 'Coverage', 'Ledger']
					},
					{ label: 'Superannuation', icon: '▣' },
					{ label: 'Travel', icon: '✈' },
					{ label: 'Fixxxer', icon: '⚒' },
					{ label: 'Tapestry', icon: '⌘' },
					{ label: 'Fat Controller', icon: '▩' },
					{ label: 'Admin', icon: '⛨' }
				]
			}
		],
		crumb: ['Securities', 'Investing'],
		eyebrow: null,
		peers: [
			{ label: 'Overview' },
			{ label: 'Investing', active: true },
			{ label: 'Trading' },
			{ label: 'Live' },
			{ label: 'P&L' },
			{ label: 'Coverage' },
			{ label: 'Ledger', count: '4,318' }
		],
		scope: [
			{ k: 'Entity', v: 'All entities' },
			{ k: 'Period', v: 'FY26' }
		],
		title: 'Investing',
		subtitle: 'Realised, in AUD · 12 accounts · 4,318 ledger events',
		actions: [{ label: 'Export' }, { label: 'Add account', primary: true }]
	},
	{
		// The only app currently using the shell's `context` slot (store switcher),
		// and the only one with an eyebrow — "SECRETS BROKER", which restates the
		// brand two inches to its left.
		id: 'portcullis',
		name: 'Portcullis',
		mark: '▢',
		hue: 75,
		initials: 'PG',
		who: 'Operator',
		searchLabel: 'Search credentials, identities, vendors…',
		nav: [
			{ group: null, items: [{ label: 'Overview', icon: '▦', active: true }] },
			{
				group: 'Access',
				items: [
					{ label: 'Credentials', icon: '▣' },
					{ label: 'Identities', icon: '⚿' }
				]
			},
			{ group: 'Stores', items: [{ label: 'Connections', icon: '▤' }] },
			{ group: 'Activity', items: [{ label: 'Audit', icon: '▥' }] },
			{
				group: 'Settings',
				items: [
					{ label: 'Authentication', icon: '⛨' },
					{ label: 'Doctor', icon: '⚕' },
					{ label: 'Guide', icon: '◈' }
				]
			}
		],
		crumb: ['Portcullis', 'Overview'],
		eyebrow: 'Secrets broker',
		peers: [],
		scope: [{ k: 'Store', v: 'Bitwarden' }],
		title: 'Overview',
		subtitle: 'Broker health, recent vends and what needs attention.',
		actions: [{ label: 'Connect store' }, { label: 'Enrol identity', primary: true }]
	},
	{
		// Renders NO identity at all today. Its table truncates Tags and
		// Collections while ~640px sits unused either side at 3360.
		id: 'library',
		name: 'the library',
		mark: '▤',
		hue: 250,
		initials: 'PG',
		who: 'Operator',
		searchLabel: 'Search…',
		nav: [
			{
				group: null,
				items: [
					{ label: 'Reading Room', icon: '▤' },
					{ label: 'Agent', icon: '✦' },
					{ label: 'Search', icon: '⌕' },
					{ label: 'Library', icon: '▥', active: true, children: ['Documents', 'Saved', 'Recent'] },
					{ label: 'Collections', icon: '▦' },
					{ label: 'Projects', icon: '▣' },
					{ label: 'Operations', icon: '◐' },
					{ label: 'Metrics', icon: '▩' }
				]
			}
		],
		crumb: ['Library', 'Documents'],
		eyebrow: null,
		peers: [{ label: 'Documents', active: true }, { label: 'Saved' }, { label: 'Recent' }],
		scope: [
			{ k: 'Collection', v: 'All' },
			{ k: 'Status', v: 'Indexed' }
		],
		title: 'Documents',
		subtitle: '2,310 documents · page 1 of 93',
		actions: [{ label: 'Ingest', primary: true }]
	},
	{
		id: 'cadmus',
		name: 'Cadmus',
		mark: '✦',
		hue: 250,
		initials: 'PG',
		who: 'Operator',
		searchLabel: 'Search Cadmus',
		nav: [
			{
				group: null,
				items: [
					{ label: 'Digital ACP Market…', icon: '▤' },
					{ label: 'Library', icon: '▥' },
					{ label: 'Education', icon: '▦', active: true, children: ['Modules', 'Research'] },
					{ label: 'Leave', icon: '▩' },
					{ label: 'Intelligence', icon: '◈' },
					{ label: 'ID26', icon: '▣' }
				]
			}
		],
		crumb: ['Cadmus', 'Workbench'],
		eyebrow: null,
		peers: [],
		scope: [],
		title: 'Workbench',
		subtitle: 'Your Defence day-job sections, gathered in one place.',
		actions: []
	},
	{
		// Already builds the context row by hand, in the page body: Top Music /
		// Skipped Music tabs on the left, Week/Month/Year/All on the right.
		id: 'earworm',
		name: 'Earworm',
		mark: '♫',
		hue: 300,
		initials: 'PG',
		who: '',
		searchLabel: 'Jump to a page…',
		nav: [
			{
				group: null,
				items: [
					{ label: 'Dashboard', icon: '▦', active: true, children: ['Top Music', 'Skipped Music'] },
					{ label: 'History', icon: '↻' },
					{ label: 'Year in Review', icon: '▣' },
					{ label: 'API Docs', icon: '▤' }
				]
			}
		],
		crumb: ['Earworm', 'Dashboard'],
		eyebrow: null,
		peers: [{ label: 'Top Music', active: true }, { label: 'Skipped Music' }],
		scope: [
			{ k: 'Range', v: 'All' },
			{ k: 'View', v: 'Chart' }
		],
		title: 'Dashboard',
		subtitle: 'Listening across every scrobbled source.',
		actions: []
	}
];
