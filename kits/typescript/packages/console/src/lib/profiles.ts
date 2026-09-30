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
 * controls[], actions[].
 *
 * `peers` are the section's other SUB-ROUTES, never its default one. A module's own
 * root is its dashboard — clicking Securities lands on the Securities dashboard
 * — so an "Overview" peer would be the section listed as a child of itself
 * (operator ruling, 04/09/2026). A section with no peers is the common case and
 * the one worth checking: the rail's roll-out has to collapse to nothing
 * without leaving a hole where it was.
 */

export interface Peer { label: string; count?: string; active?: boolean }
/**
 * A control in the TOP RAIL. These change the view of the page you are already
 * on — a financial year, an entity, a chart/table toggle — and never navigate
 * anywhere. That is the whole distinction from `peers`, which are sub-routes and
 * live in the sidebar (operator ruling, 04/09/2026): different axis, different
 * home, and a control listed in both places is the same thing twice.
 *
 * `options` makes it a segmented toggle; without it, it is a dropdown.
 */
export interface Control {
	k: string;
	v: string;
	options?: string[];
}
export interface Action { label: string; primary?: boolean }
export interface Section {
	label: string;
	icon: string;
	crumb: string[];
	content: 'dashboard' | 'table' | 'tiles' | 'form' | 'prose';
	peers?: Peer[];
	controls?: Control[];
	actions?: Action[];
}
/**
 * The signed-in user, in the field names the stamped template's auth store
 * already uses (`frontend/src/lib/auth.svelte.ts`: User, Membership). Matching
 * them is deliberate — a menu designed against invented fields would need
 * rewriting to consume the real ones, and every field below is already
 * populated from the identity provider today. Nothing renders them: the
 * template's own layout passes no `identity` snippet at all.
 */
export interface Identity {
	username: string;
	display_name: string | null;
	email: string | null;
	workspace: string;
	role: 'owner' | 'member';
	entitlements: string[];
}

export interface AppProfile {
	id: string;
	name: string;
	mark: string;
	hue: number;
	who: string;
	searchLabel: string;
	identity: Identity;
	sections: Section[];
}

/** Does this section have anything for the rail's contextual zone to carry? */
export const hasContext = (s: Section): boolean =>
	(s.peers?.length ?? 0) + (s.controls?.length ?? 0) + (s.actions?.length ?? 0) > 0;

export const PROFILES: AppProfile[] = [
	{
		id: 'godswood',
		identity: { username: 'poodle64', display_name: 'Operator', email: 'operator@example.invalid', workspace: 'Household', role: 'owner', entitlements: ['admin', 'securities', 'property'] },
		name: 'Godswood',
		mark: '◈',
		hue: 150,
		who: 'Operator',
		searchLabel: 'Search Godswood…',
		// Extracted from the live app 04/09/2026 with scripts/extract-nav.js, not
		// invented. Every module below was wrong when written by hand: Property had
		// five imagined sub-routes instead of three real ones, Net Worth had none
		// instead of three, and Securities' P&L points at /securities/tax.
		sections: [
			{ label: 'Home', icon: '⌂', crumb: ['Home'], content: 'tiles' },
			{
				label: 'Essentialism',
				icon: '▤',
				crumb: ['Essentialism'],
				content: 'dashboard',
				peers: [
					{ label: 'Accounts' },
					{ label: 'Categories' },
					{ label: 'Payee Rules' },
					{ label: 'Clearing' },
					{ label: 'Hearth' },
					{ label: 'Dirty Words' }
				]
			},
			{
				label: 'Groceries',
				icon: '▦',
				crumb: ['Groceries'],
				content: 'table',
				peers: [{ label: 'Categories' }, { label: 'Shops' }, { label: 'Review' }]
			},
			{
				label: 'Budget',
				icon: '◎',
				crumb: ['Budget'],
				content: 'dashboard',
				peers: [{ label: 'Review' }, { label: 'Residual' }, { label: 'History' }],
				controls: [{ k: 'Period', v: 'Sep 2026' }],
				actions: [{ label: 'Add transaction', primary: true }]
			},
			{
				label: 'Property',
				icon: '⌂',
				crumb: ['Property'],
				content: 'tiles',
				peers: [{ label: 'P&L' }, { label: 'Property Managers' }, { label: 'Tools' }],
				controls: [{ k: 'Entity', v: 'All entities' }],
				actions: [{ label: 'Add property', primary: true }]
			},
			{
				label: 'Net Worth',
				icon: '◐',
				crumb: ['Net Worth'],
				content: 'dashboard',
				peers: [{ label: 'Ledger' }, { label: 'Entities' }, { label: 'Ownership' }],
				controls: [{ k: 'FY', v: 'FY26', options: ['FY24', 'FY25', 'FY26'] }]
			},
			{
				label: 'Securities',
				icon: '▥',
				crumb: ['Securities'],
				content: 'dashboard',
				peers: [
					{ label: 'Investing' },
					{ label: 'Trading' },
					{ label: 'Live' },
					{ label: 'P&L' },
					{ label: 'Coverage' },
					{ label: 'Ledger' }
				],
				controls: [
					{ k: 'Entity', v: 'All entities' },
					{ k: 'FY', v: 'FY26', options: ['FY24', 'FY25', 'FY26'] }
				],
				actions: [{ label: 'Add account', primary: true }, { label: 'Export' }]
			},
			{ label: 'Superannuation', icon: '▣', crumb: ['Superannuation'], content: 'dashboard' },
			{
				label: 'Travel',
				icon: '✈',
				crumb: ['Travel'],
				content: 'tiles',
				peers: [
					{ label: 'Trips' },
					{ label: 'Fares' },
					{ label: 'Ledger' },
					{ label: 'Statistics' },
					{ label: 'Status credits' }
				]
			},
			{ label: 'Fixxxer', icon: '⚒', crumb: ['Fixxxer'], content: 'table' },
			{
				label: 'Tapestry',
				icon: '⌘',
				crumb: ['Tapestry'],
				content: 'tiles',
				peers: [
					{ label: 'People' },
					{ label: 'Family tree' },
					{ label: 'Search' },
					{ label: 'Sittings' }
				]
			},
			{
				label: 'Fat Controller',
				icon: '▩',
				crumb: ['Fat Controller'],
				content: 'dashboard',
				peers: [
					{ label: 'Document Inbox' },
					{ label: 'Settings' },
					{ label: 'Document Types' },
					{ label: 'Executions' }
				]
			},
			{ label: 'Zipper', icon: '◈', crumb: ['Zipper'], content: 'table' },
			{
				label: 'Admin',
				icon: '⛨',
				crumb: ['Admin'],
				content: 'form',
				peers: [
					{ label: 'Users' },
					{ label: 'Configuration' },
					{ label: 'Logs' },
					{ label: 'About' }
				],
				actions: [{ label: 'Save changes', primary: true }]
			}
		]
	},
	{
		// Scope control, no peer views — the case that proves a rail zone must take
		// either axis on its own.
		id: 'portcullis',
		identity: { username: 'poodle64', display_name: 'Operator', email: 'operator@example.invalid', workspace: 'Estate', role: 'owner', entitlements: ['admin', 'broker'] },
		name: 'Portcullis',
		mark: '▢',
		hue: 75,
		who: 'Operator',
		searchLabel: 'Search credentials, identities, vendors…',
		sections: [
			{
				label: 'Overview',
				icon: '▦',
				crumb: ['Portcullis'],
				content: 'dashboard',
				controls: [{ k: 'Store', v: 'Bitwarden' }],
				actions: [{ label: 'Enrol identity', primary: true }, { label: 'Connect store' }]
			},
			{
				label: 'Credentials',
				icon: '▣',
				crumb: ['Credentials'],
				content: 'table',
				controls: [
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
				peers: [{ label: 'Refusals' }, { label: 'Admin' }],
				controls: [{ k: 'Window', v: 'Last 24h' }]
			},
			{
				label: 'Authentication',
				icon: '⛨',
				crumb: ['Settings'],
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
		identity: { username: 'poodle64', display_name: null, email: 'operator@example.invalid', workspace: 'Estate knowledge', role: 'member', entitlements: ['read'] },
		name: 'the library',
		mark: '▤',
		hue: 250,
		who: 'Operator',
		searchLabel: 'Search…',
		sections: [
			{ label: 'Reading Room', icon: '▤', crumb: ['Reading Room'], content: 'prose' },
			{
				label: 'Library',
				icon: '▥',
				crumb: ['Library'],
				content: 'table',
				peers: [{ label: 'Saved' }, { label: 'Recent' }],
				controls: [
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
				controls: [{ k: 'Window', v: 'Last 7d' }]
			},
			{ label: 'Metrics', icon: '▩', crumb: ['Metrics'], content: 'dashboard' }
		]
	},

	{
		// Every section bare — the app with nothing contextual anywhere, which is
		// what a rail zone has to disappear cleanly for.
		id: 'cadmus',
		identity: { username: 'poodle64', display_name: 'Operator', email: null, workspace: 'Defence', role: 'member', entitlements: [] },
		name: 'Cadmus',
		mark: '✦',
		hue: 250,
		who: 'Operator',
		searchLabel: 'Search Cadmus',
		sections: [
			{ label: 'Workbench', icon: '▦', crumb: ['Workbench'], content: 'tiles' },
			{ label: 'Library', icon: '▥', crumb: ['Library'], content: 'table' },
			{
				label: 'Education',
				icon: '▤',
				crumb: ['Education'],
				content: 'tiles',
				peers: [{ label: 'Research' }]
			},
			{ label: 'Leave', icon: '▩', crumb: ['Leave'], content: 'dashboard' },
			{ label: 'Intelligence', icon: '◈', crumb: ['Intelligence'], content: 'prose' },
			{ label: 'ID26', icon: '▣', crumb: ['ID26'], content: 'table' }
		]
	},

	{
		// Already builds the context row by hand, in the page body.
		id: 'earworm',
		identity: { username: 'poodle64', display_name: 'Operator', email: 'operator@example.invalid', workspace: 'Household', role: 'owner', entitlements: ['scrobble'] },
		name: 'Earworm',
		mark: '♫',
		hue: 300,
		who: 'Operator',
		searchLabel: 'Jump to a page…',
		sections: [
			{
				label: 'Dashboard',
				icon: '▦',
				crumb: ['Dashboard'],
				content: 'dashboard',
				controls: [
					{ k: 'Slice', v: 'Top Music', options: ['Top Music', 'Skipped Music'] },
					{ k: 'Range', v: 'All', options: ['Week', 'Month', 'Year', 'All'] },
					{ k: 'View', v: 'Chart', options: ['Chart', 'Table'] }
				]
			},
			{
				label: 'History',
				icon: '↻',
				crumb: ['History'],
				content: 'table',
				controls: [{ k: 'Range', v: 'Last 30d' }]
			},
			{
				label: 'Year in Review',
				icon: '▣',
				crumb: ['Year in Review'],
				content: 'dashboard',
				controls: [{ k: 'Year', v: '2026' }]
			},
			{ label: 'API Docs', icon: '▤', crumb: ['API Docs'], content: 'prose' }
		]
	}
];
