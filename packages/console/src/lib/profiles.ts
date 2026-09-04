/**
 * Shell-lab app profiles.
 *
 * Moved here from packages/ui/lab/apps.js when the lab became a console route:
 * a typed module the route imports, rather than a global a script tag sets.
 *
 * An app is a brand plus SECTIONS. A section is one primary nav destination and
 * everything contextual that belongs to it — its peer views, its scope controls,
 * its actions, and the content archetype it renders. Clicking the rail switches
 * section, so the lab can be walked the way the real app is rather than posed.
 *
 * Chrome only. No financial values, account identifiers or household member
 * names belong here — the shape of an app's navigation is not its data, and the
 * pre-commit PII gate blocks a real name regardless of repo visibility.
 * Identity renders a role. Name LENGTH is a real layout variable, so vary `who`
 * by hand when testing the chip against a long one.
 *
 * Section fields: label, icon, crumb[], content, and optionally peers[],
 * scope[], actions[]. A section with none of those last three is the bare case,
 * and the bare case is the one worth looking at — most sections of most apps
 * have nothing contextual, and a rail zone that collapses to nothing must not
 * leave a hole where it was.
 */

export interface Peer { label: string; count?: string; active?: boolean }
export interface Scope { k: string; v: string }
export interface Action { label: string; primary?: boolean }
export interface Section {
	label: string;
	icon: string;
	crumb: string[];
	content: 'dashboard' | 'table' | 'tiles' | 'form' | 'prose';
	peers?: Peer[];
	scope?: Scope[];
	actions?: Action[];
}
export interface AppProfile {
	id: string;
	name: string;
	mark: string;
	hue: number;
	initials: string;
	who: string;
	searchLabel: string;
	sections: Section[];
}

/** Does this section have anything for the rail's contextual zone to carry? */
export const hasContext = (s: Section): boolean =>
	(s.peers?.length ?? 0) + (s.scope?.length ?? 0) + (s.actions?.length ?? 0) > 0;

export const PROFILES: AppProfile[] = [
	{
		id: 'godswood',
		name: 'Godswood',
		mark: '◈',
		hue: 150,
		initials: 'PG',
		who: 'Operator',
		searchLabel: 'Search Godswood…',
		sections: [
			{ label: 'Home', icon: '⌂', crumb: ['Home'], content: 'tiles' },

			{
				label: 'Budget',
				icon: '◎',
				crumb: ['Budget', 'This month'],
				content: 'dashboard',
				peers: [
					{ label: 'This month', active: true },
					{ label: 'Categories' },
					{ label: 'Recurring' },
					{ label: 'Forecast' }
				],
				scope: [
					{ k: 'Entity', v: 'Household' },
					{ k: 'Period', v: 'Sep 2026' }
				],
				actions: [{ label: 'Add transaction', primary: true }, { label: 'Import' }]
			},

			{
				label: 'Property',
				icon: '⌂',
				crumb: ['Property', 'Portfolio'],
				content: 'tiles',
				peers: [
					{ label: 'Portfolio', active: true },
					{ label: 'Valuations' },
					{ label: 'Loans' },
					{ label: 'Expenses' },
					{ label: 'Documents', count: '412' }
				],
				scope: [
					{ k: 'Entity', v: 'All entities' },
					{ k: 'Status', v: 'Held' }
				],
				actions: [{ label: 'Add property', primary: true }]
			},

			{
				label: 'Net Worth',
				icon: '◐',
				crumb: ['Net Worth'],
				content: 'dashboard',
				scope: [{ k: 'Period', v: 'FY26' }]
			},

			{
				label: 'Securities',
				icon: '▥',
				crumb: ['Securities', 'Investing'],
				content: 'dashboard',
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
				actions: [{ label: 'Add account', primary: true }, { label: 'Export' }]
			},

			{ label: 'Superannuation', icon: '▣', crumb: ['Superannuation'], content: 'dashboard' },
			{ label: 'Travel', icon: '✈', crumb: ['Travel'], content: 'tiles' },
			{
				label: 'Admin',
				icon: '⛨',
				crumb: ['Admin', 'Settings'],
				content: 'form',
				peers: [{ label: 'Settings', active: true }, { label: 'Users' }, { label: 'Audit' }],
				actions: [{ label: 'Save changes', primary: true }, { label: 'Cancel' }]
			}
		]
	},

	{
		// Scope control, no peer views — the case that proves a rail zone must take
		// either axis on its own.
		id: 'portcullis',
		name: 'Portcullis',
		mark: '▢',
		hue: 75,
		initials: 'PG',
		who: 'Operator',
		searchLabel: 'Search credentials, identities, vendors…',
		sections: [
			{
				label: 'Overview',
				icon: '▦',
				crumb: ['Portcullis', 'Overview'],
				content: 'dashboard',
				scope: [{ k: 'Store', v: 'Bitwarden' }],
				actions: [{ label: 'Enrol identity', primary: true }, { label: 'Connect store' }]
			},
			{
				label: 'Credentials',
				icon: '▣',
				crumb: ['Credentials'],
				content: 'table',
				scope: [
					{ k: 'Collection', v: 'All' },
					{ k: 'State', v: 'Active' }
				],
				actions: [{ label: 'New credential', primary: true }]
			},
			{
				label: 'Identities',
				icon: '⚿',
				crumb: ['Identities'],
				content: 'table',
				actions: [{ label: 'Enrol', primary: true }]
			},
			{
				label: 'Audit',
				icon: '▥',
				crumb: ['Audit'],
				content: 'table',
				peers: [{ label: 'Reads', active: true }, { label: 'Refusals' }, { label: 'Admin' }],
				scope: [{ k: 'Window', v: 'Last 24h' }]
			},
			{
				label: 'Authentication',
				icon: '⛨',
				crumb: ['Settings', 'Authentication'],
				content: 'form',
				actions: [{ label: 'Save', primary: true }]
			},
			{ label: 'Guide', icon: '◈', crumb: ['Guide'], content: 'prose' }
		]
	},

	{
		// Renders no identity at all today, and its table truncates columns while
		// ~640px sits unused either side at 3360.
		id: 'library',
		name: 'the library',
		mark: '▤',
		hue: 250,
		initials: 'PG',
		who: 'Operator',
		searchLabel: 'Search…',
		sections: [
			{ label: 'Reading Room', icon: '▤', crumb: ['Reading Room'], content: 'prose' },
			{
				label: 'Library',
				icon: '▥',
				crumb: ['Library', 'Documents'],
				content: 'table',
				peers: [{ label: 'Documents', active: true }, { label: 'Saved' }, { label: 'Recent' }],
				scope: [
					{ k: 'Collection', v: 'All' },
					{ k: 'Status', v: 'Indexed' }
				],
				actions: [{ label: 'Ingest', primary: true }]
			},
			{
				label: 'Collections',
				icon: '▦',
				crumb: ['Collections'],
				content: 'tiles',
				actions: [{ label: 'New collection', primary: true }]
			},
			{
				label: 'Operations',
				icon: '◐',
				crumb: ['Operations'],
				content: 'dashboard',
				scope: [{ k: 'Window', v: 'Last 7d' }]
			},
			{ label: 'Metrics', icon: '▩', crumb: ['Metrics'], content: 'dashboard' }
		]
	},

	{
		// Every section bare — the app with nothing contextual anywhere, which is
		// what a rail zone has to disappear cleanly for.
		id: 'cadmus',
		name: 'Cadmus',
		mark: '✦',
		hue: 250,
		initials: 'PG',
		who: 'Operator',
		searchLabel: 'Search Cadmus',
		sections: [
			{ label: 'Workbench', icon: '▦', crumb: ['Workbench'], content: 'tiles' },
			{ label: 'Library', icon: '▥', crumb: ['Library'], content: 'table' },
			{
				label: 'Education',
				icon: '▤',
				crumb: ['Education', 'Modules'],
				content: 'tiles',
				peers: [{ label: 'Modules', active: true }, { label: 'Research' }]
			},
			{ label: 'Leave', icon: '▩', crumb: ['Leave'], content: 'dashboard' },
			{ label: 'Intelligence', icon: '◈', crumb: ['Intelligence'], content: 'prose' },
			{ label: 'ID26', icon: '▣', crumb: ['ID26'], content: 'table' }
		]
	},

	{
		// Already builds the context row by hand, in the page body.
		id: 'earworm',
		name: 'Earworm',
		mark: '♫',
		hue: 300,
		initials: 'PG',
		who: 'Operator',
		searchLabel: 'Jump to a page…',
		sections: [
			{
				label: 'Dashboard',
				icon: '▦',
				crumb: ['Dashboard'],
				content: 'dashboard',
				peers: [{ label: 'Top Music', active: true }, { label: 'Skipped Music' }],
				scope: [
					{ k: 'Range', v: 'All' },
					{ k: 'View', v: 'Chart' }
				]
			},
			{
				label: 'History',
				icon: '↻',
				crumb: ['History'],
				content: 'table',
				scope: [{ k: 'Range', v: 'Last 30d' }]
			},
			{
				label: 'Year in Review',
				icon: '▣',
				crumb: ['Year in Review'],
				content: 'dashboard',
				scope: [{ k: 'Year', v: '2026' }]
			},
			{ label: 'API Docs', icon: '▤', crumb: ['API Docs'], content: 'prose' }
		]
	}
];
