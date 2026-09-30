<script lang="ts">
	/**
	 * The real-browser harness for AppShell.
	 *
	 * It exists because jsdom cannot make any of the shell's visual claims:
	 * `getComputedStyle` there returns the unresolved `var(--…)` literal, so a
	 * jsdom assertion passes just as happily on a colour nothing defines. That
	 * blind spot has hidden five separate defects in this programme. Everything
	 * about width, colour, breakpoint and the actual light/dark flip is proved
	 * here, driven by a script against a real engine; the interaction logic is
	 * proved in `src/test/app-shell.test.ts`.
	 *
	 * The imports point at `../dist`, not `../src`: the claim being verified is
	 * about the artefact a consuming app installs, and svelte-package rewrites
	 * import specifiers on the way out, so the source is not the same input.
	 *
	 * `harness/drive.md` records the choreography and the assertions.
	 */
	import { ModeWatcher } from 'mode-watcher';
	import AppShell from '../dist/components/ui/app-shell/app-shell.svelte';
	import AppNav from '../dist/components/ui/app-shell/app-nav.svelte';
	import CommandPalette from '../dist/components/ui/command-palette/command-palette.svelte';
	import LoadingState from '../dist/components/ui/loading-state/loading-state.svelte';
	import ErrorState from '../dist/components/ui/error-state/error-state.svelte';
	import EmptyState from '../dist/components/ui/empty-state/empty-state.svelte';
	import AppDialog from '../dist/components/ui/app-dialog/app-dialog.svelte';
	import * as DropdownMenu from '../dist/components/ui/dropdown-menu/index.js';
	import * as Popover from '../dist/components/ui/popover/index.js';
	import * as Select from '../dist/components/ui/select/index.js';
	import * as Command from '../dist/components/ui/command/index.js';
	import * as Table from '../dist/components/ui/table/index.js';
	import * as Tabs from '../dist/components/ui/tabs/index.js';
	import Avatar from '../dist/components/ui/avatar/avatar.svelte';
	import AvatarImage from '../dist/components/ui/avatar/avatar-image.svelte';
	import AvatarFallback from '../dist/components/ui/avatar/avatar-fallback.svelte';
	import SettingsShell from '../dist/components/ui/settings-shell/settings-shell.svelte';
	import Panel from '../dist/components/ui/panel/panel.svelte';
	import Card from '../dist/components/ui/card/card.svelte';
	import CardHeader from '../dist/components/ui/card/card-header.svelte';
	import CardTitle from '../dist/components/ui/card/card-title.svelte';
	import CardDescription from '../dist/components/ui/card/card-description.svelte';
	import CardContent from '../dist/components/ui/card/card-content.svelte';
	import DetailPanel from '../dist/components/ui/detail-panel/detail-panel.svelte';
	import ArcGauge from '../dist/components/ui/arc-gauge/arc-gauge.svelte';
	import BarRow from '../dist/components/ui/bar-row/bar-row.svelte';
	import Scorecard from '../dist/components/ui/scorecard/scorecard.svelte';
	import Sparkline from '../dist/components/ui/sparkline/sparkline.svelte';
	import StatusBadge from '../dist/components/ui/status-badge/status-badge.svelte';
	import type { NavSource } from '../dist/components/ui/app-shell/types.js';
	import { SHELL_MEASURES, type ShellMeasure } from '../dist/components/ui/app-shell/measure.js';
	import { SHELL_TEXTURES, type ShellTexture } from '../dist/components/ui/app-shell/texture.js';
	import Button from '../dist/components/ui/button/button.svelte';
	import Badge from '../dist/components/ui/badge/badge.svelte';
	import Input from '../dist/components/ui/input/input.svelte';
	import Label from '../dist/components/ui/label/label.svelte';
	import Checkbox from '../dist/components/ui/checkbox/checkbox.svelte';
	import Switch from '../dist/components/ui/switch/switch.svelte';
	import Skeleton from '../dist/components/ui/skeleton/skeleton.svelte';
	import SchemaForm from '../dist/components/ui/schema-form/schema-form.svelte';
	import LibraryBrowse from '../dist/components/ui/library-browse/library-browse.svelte';
	import CollectionDetail from '../dist/components/ui/collection-detail/collection-detail.svelte';
	import DocumentDetail from '../dist/components/ui/document-detail/document-detail.svelte';
	import SearchResults from '../dist/components/ui/search-results/search-results.svelte';
	import PageCanvas from '../dist/components/ui/page-canvas/page-canvas.svelte';
	import type { PageCanvasRegion } from '../dist/components/ui/page-canvas/types.js';
	import FactGrid from '../dist/components/ui/fact-grid/fact-grid.svelte';
	import ContextColumn from '../dist/components/ui/context-column/context-column.svelte';
	import TileGrid from '../dist/components/ui/tile-grid/tile-grid.svelte';
	import { AppIdentity } from '../dist/components/ui/app-identity/index.js';
	import ShellControls from '../dist/components/ui/app-shell/shell-controls.svelte';
	import { Segmented } from '../dist/components/ui/segmented/index.js';
	import ListShell from '../dist/components/ui/list-shell/list-shell.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	let auditYear = $state('FY26');
	import { DataTableTanstack } from '../dist/components/ui/data-table-tanstack/index.js';
	import type { ColumnDef } from '../dist/components/ui/data-table-tanstack/index.js';
	import { createSvelteTable } from '../dist/components/ui/data-table/index.js';
	import { getCoreRowModel } from '@tanstack/table-core';
	import type { StatItem } from '../dist/components/ui/stat-list/stat-list.svelte';
	import type {
		LibraryCollection,
		LibraryDocument,
		LibraryDocumentDetail,
		LibraryFacet,
		LibrarySearchResult
	} from '../dist/components/ui/library-browse/index.js';
	import Separator from '../dist/components/ui/separator/separator.svelte';
	import { Alert, AlertTitle, AlertDescription } from '../dist/components/ui/alert/index.js';
	import { DS_PALETTES } from '@poodle64/design-tokens/palettes';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Package from '@lucide/svelte/icons/package';
	import KeySquare from '@lucide/svelte/icons/key-square';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Users from '@lucide/svelte/icons/users';
	import Gavel from '@lucide/svelte/icons/gavel';
	import Receipt from '@lucide/svelte/icons/receipt';
	import Zap from '@lucide/svelte/icons/zap';
	import Info from '@lucide/svelte/icons/info';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	// `?surface=nested` drives nested navigation. Three of its four claims are
	// beyond jsdom entirely: the indent geometry is a layout fact, the chevron's
	// rotation is a resolved transform, and whether a fifteen-row tree fits a
	// 360px drawer needs a real engine to answer at all. The labels below are
	// deliberately longer than the rail is wide — a tree that only fits because
	// the test data was short proves nothing about an app's real section names.
	const nestedNav: NavSource = [
		{ label: 'Overview', href: '#/overview', icon: LayoutDashboard },
		{
			label: 'Education',
			href: '#/education',
			icon: ScrollText,
			children: Array.from({ length: 15 }, (_, i) => ({
				label: `Open architecture and autonomy, topic ${i + 1}`,
				href: `#/education/topic-${i + 1}`
			}))
		},
		{
			heading: 'Access',
			items: [
				{
					label: 'Credentials',
					href: '#/credentials',
					icon: Package,
					badge: 3,
					children: [
						{ label: 'Rotations', href: '#/rotations' },
						{ label: 'Expiring soon', href: '#/expiring' }
					]
				},
				{ label: 'Identities', href: '#/identities', icon: KeySquare }
			]
		}
	];

	const nav: NavSource = [
		{ label: 'Overview', href: '#/overview', icon: LayoutDashboard },
		{
			heading: 'Access',
			items: [
				{ label: 'Credentials', href: '#/credentials', icon: Package, badge: 3 },
				{ label: 'Identities', href: '#/identities', icon: KeySquare }
			]
		},
		{ heading: 'Activity', items: [{ label: 'Audit', href: '#/audit', icon: ScrollText }] }
	];

	// The collapse state is driven from the URL query so the capture script sets
	// it by navigation rather than by synthesising clicks.
	const params = new URLSearchParams(location.search);
	const collapsible = params.get('collapsible') === '1';
	// `?search=trailing` drives the search affordance into the right-hand controls
	// group; `?search=leading` (or unset) leaves it in its historical spot. Only an
	// engine tells the two apart — whether the button stretches the row or sizes to
	// its clamp is a flex-layout fact jsdom has no answer for.
	const searchParam = params.get('search');
	const searchPlacement =
		searchParam === 'trailing' || searchParam === 'leading' ? searchParam : undefined;
	// `?surface=states` swaps the shell for the async-outcome surfaces. Their
	// announcement contract is a claim about the platform accessibility tree,
	// which jsdom does not build: testing-library computes a role from a static
	// element→role table, so it confirms the attribute string and nothing about
	// what a screen reader is actually handed.
	// `?surface=card` puts a div-mode CardTitle beside a heading-mode one in the
	// same card, so the "a heading looks byte-identical to the div" claim is
	// measured rather than argued. jsdom cannot make it: `<h3>` and `<div>`
	// differ only in what the UA stylesheet adds, and jsdom applies no
	// stylesheet at all, so the two are trivially identical there whether or
	// not anything neutralises the UA margins.
	// `?surface=overlays` drives the four bits-ui overlay families whose
	// enter/exit transitions the package's data-open:/data-closed: utilities
	// carry. Neither jsdom nor a compiled-CSS gate can see the end of that
	// chain: only an engine resolves `animation-name` on an element that has
	// actually opened.
	// `?surface=overflow` puts a table wider than the viewport inside the shell,
	// so the hidden sideways scroll of #5 is measured rather than reasoned about
	// — `&wrapper=auto` reproduces the second mechanism (an `mx-auto` page
	// wrapper suppressing cross-axis stretch), which is a different sizing rule
	// and needs its own case.
	// `?surface=avatar` drives the real load-state swap over the network: a URL
	// that cannot resolve, one that can, and no source at all.
	// `?surface=theming` drives scoped theming (#8): the same probe set at the
	// page root, inside a subtree overriding --ds-color-* only, and inside a
	// subtree carrying a scoped .dark class. Neither jsdom nor a compiled-CSS
	// gate can tell "resolved once at :root, then inherited unchanged" apart
	// from "resolved live at this element" — only a real cascade can.
	// `?surface=long-lists` opens each floating overlay over a list longer than
	// the viewport. Nothing short of an engine can make this claim: whether
	// `overflow-y-auto` does anything depends entirely on whether a height
	// constrains the box, which is a layout fact, and jsdom has no layout — it
	// reports scrollHeight and clientHeight as 0 either way.
	// `?surface=settings` drives the settings destination. Every claim it makes is
	// a layout fact jsdom cannot hold: whether the section list is actually 240px
	// wide, whether the two panes scroll INDEPENDENTLY (which depends entirely on
	// whether a height bounds them — jsdom reports every scrollHeight as 0), and
	// whether the same markup stacks below md instead of crushing the content pane
	// into a sliver. `?settings=path` moves the current row.
	const surface = params.get('surface') ?? 'shell';
	const wrapper = params.get('wrapper') ?? 'plain';
	// `?identity=bare` — see the mobile-audit fixture below.
	const identityParam = params.get('identity');
	// `table` is the reported case: a wide child that carries its own scroller.
	// `word` is the harsher one — an unbreakable string with no scroller of its
	// own, which nothing can make fit; it is here to pin what the shell DOES
	// guarantee under it (its own box stays the content box) rather than to
	// claim an overflow that is the page's to solve.
	const overflowContent = params.get('content') ?? 'table';
	// `?pagenav=1` adds an AppNav inside the PAGE BODY, so the half of the nav-ink
	// rule that must NOT follow the chrome is driven too. It is in the body and
	// not a shell slot because the shell has no second-column slot to put it in —
	// `sidebar` was removed in 2026.8.11.
	const withPageNav = params.get('pagenav') === '1';
	// `?surface=measure&measure=<tier>` drives the content measure. Every claim
	// it makes is a resolved length — `80rem` against the root font size, `72ch`
	// against the body face, a cap that binds only once the viewport is wide
	// enough to reach it, and a box centred by auto margins inside a flex
	// column. jsdom resolves none of those: it reports `max-width` as the
	// unresolved literal and every rect as zero, so a unit test there would pass
	// against a build whose stylesheet was never imported at all.
	//
	// Validated back onto the union rather than cast, so a typo in the query
	// string renders the default instead of a class with no rule behind it.
	const measureParam: ShellMeasure =
		SHELL_MEASURES.find((m) => m === params.get('measure')) ?? 'full';
	// `?surface=texture&texture=<grid|none>` drives the content texture. Every
	// claim it makes needs an engine and most need a compositor: the gradients are
	// `color-mix()` over the app's own palette, the picture is a resolved
	// background rather than an element, `background-attachment: local` is a
	// painting behaviour with no DOM trace at all, and "does not print" is a media
	// state. jsdom returns an empty string for `background-image` whether the
	// stylesheet was imported or not.
	//
	// The page body is deliberately taller than any viewport driven here, because
	// the load-bearing claim — the texture travels with the content instead of
	// hanging frozen behind it — can only be observed by scrolling and looking
	// twice. `?blank=1` suppresses the copy so the driver can photograph a strip
	// of bare floor either side of a scroll, where the only thing that can differ
	// is the texture itself.
	const textureParam: ShellTexture =
		SHELL_TEXTURES.find((t) => t === params.get('texture')) ?? 'none';
	const textureBlank = params.get('blank') === '1';
	// `?surface=console` (design-system#15) drives the five console-dashboard
	// primitives promoted from mission-command. jsdom cannot resolve any
	// --ds-color-status-*/--ds-color-primary var() chain, so ArcGauge's tone
	// colour, StatusBadge's new `primary` extension and BarRow's fill-as-a-
	// real-percentage-of-its-track are measured here against a real cascade;
	// drive.mjs reads them back. Scorecard and Sparkline's claims (a dot class
	// per score, point coordinates derived from the data) need no CSS
	// resolution and are proved under jsdom in src/test/ — they render here
	// only for visual completeness.
	const ARC_TONES = ['success', 'warning', 'error'] as const;
	const BADGE_STATUSES = ['success', 'warning', 'error', 'info', 'neutral', 'primary'] as const;

	// `?surface=schema-form` drives <SchemaForm> over a deliberately part-broken
	// pair of documents. Two of its claims need an engine and cannot be made in
	// jsdom: that the flagged fallback is actually PAINTED — a warning border
	// and tint resolved out of --ds-color-status-warning, not a `var()` literal
	// — and that it has real height and width on the page. "Renders loudly" is a
	// visual claim, and a jsdom test can only prove the markup exists; a
	// fallback styled into invisibility would pass every check in src/test/ and
	// reproduce the exact defect this component was built to end.
	const SCHEMA_FORM_SCHEMA = {
		type: 'object',
		required: ['name'],
		properties: {
			name: { type: 'string', title: 'Display name', description: 'Shown in the console.' },
			enabled: { type: 'boolean', title: 'Enabled' },
			engine: { type: 'string', title: 'Engine', enum: ['ollama', 'bedrock'] },
			mode: { type: 'string', title: 'Mode', enum: ['fast', 'deep'] },
			notes: { type: 'string', title: 'Notes' },
			tags: { type: 'array', title: 'Tags', items: { type: 'string' } },
			legacy: { type: 'string', title: 'Legacy field' },
			retention: {
				type: 'object',
				title: 'Retention',
				properties: { days: { type: 'integer', title: 'Days' } }
			},
			tuning: {
				type: 'object',
				title: 'Tuning',
				properties: {
					depth: { type: 'integer', title: 'Depth', minimum: 1, maximum: 10 },
					temperature: { type: 'number', title: 'Temperature', minimum: 0, maximum: 2 },
					endpoint: { type: 'string', title: 'Endpoint' }
				}
			}
		}
	};
	const SCHEMA_FORM_UI = {
		type: 'VerticalLayout',
		elements: [
			{ type: 'Control', scope: '#/properties/name' },
			{ type: 'Control', scope: '#/properties/enabled' },
			{ type: 'Control', scope: '#/properties/engine' },
			{ type: 'Control', scope: '#/properties/mode', options: { format: 'radio' } },
			{ type: 'Control', scope: '#/properties/notes', options: { multi: true } },
			{ type: 'Control', scope: '#/properties/tags' },
			// The live defect, reproduced on purpose: a hint nothing registers.
			{ type: 'Control', scope: '#/properties/legacy', options: { widget: 'dropdown' } },
			{
				type: 'Group',
				label: 'Tuning',
				rule: {
					effect: 'SHOW',
					condition: { scope: '#/properties/enabled', schema: { const: true } }
				},
				elements: [
					{
						type: 'HorizontalLayout',
						elements: [
							{
								type: 'Control',
								scope: '#/properties/tuning/properties/depth',
								options: { slider: true }
							},
							{ type: 'Control', scope: '#/properties/tuning/properties/temperature' }
						]
					},
					{
						type: 'Control',
						scope: '#/properties/tuning/properties/endpoint',
						rule: {
							effect: 'SHOW',
							condition: { scope: '#/properties/engine', schema: { const: 'bedrock' } }
						}
					}
				]
			},
			// An element type outside the vocabulary.
			{ type: 'Accordion', label: 'Advanced' }
			// `retention` is addressed by nothing at all — the GROUP_ORDER defect.
		]
	};
	let schemaFormValue = $state<Record<string, unknown>>({
		name: 'Console',
		enabled: true,
		engine: 'bedrock',
		mode: 'deep',
		notes: 'A note.',
		tags: ['alpha', 'beta'],
		legacy: 'kept',
		retention: { days: 30 },
		tuning: { depth: 4, temperature: 0.7, endpoint: 'https://example.invalid' }
	});

	// `?surface=library` (#30) drives the four library components as ONE
	// consumer-shaped flow: browse → document → collection. This page plays the
	// consuming app — it owns the query, the facet selections and the
	// "routing" (a state swap), exactly as the fixed-prop contract demands, so
	// the driver proves the browse-to-detail interaction over plain props with
	// no fetch anywhere. What only an engine can claim here: the row click
	// actually lands a detail surface with real paint (jsdom can fire the
	// handler, but not show that anything legible appears), the detail's title
	// and machine values resolve their real families, and at 375px the
	// catalogue table scrolls inside its own container instead of pushing
	// sideways scroll into the shell (#5's blindness, one component up).
	let libraryView = $state<'browse' | 'document' | 'collection'>('browse');
	let libraryQuery = $state('');
	let librarySelections = $state<Record<string, string[]>>({ tag: [], year: [] });

	const LIBRARY_DOCUMENTS: LibraryDocument[] = [
		{
			id: 'doc-1',
			title: 'Trust deed — Rivers Family Trust, deed of variation',
			tags: ['legal', 'trust'],
			collections: ['household-legal'],
			badges: [{ status: 'success', label: 'Indexed' }]
		},
		{
			id: 'doc-2',
			title: 'Rates notice 2026, principal residence',
			tags: ['property'],
			collections: ['property'],
			badges: [{ status: 'info', label: 'Pending' }]
		},
		{
			id: 'doc-3',
			title: 'Insurance policy schedule, contents and building',
			tags: ['insurance'],
			collections: ['property'],
			badges: [{ status: 'warning', label: 'Missing' }]
		}
	];
	const libraryFacets: LibraryFacet[] = $derived([
		{
			key: 'tag',
			label: 'Tags',
			multiple: true,
			selected: librarySelections.tag,
			options: [
				{ value: 'legal', count: 4 },
				{ value: 'property', count: 2 },
				{ value: 'insurance', count: 1 }
			]
		},
		{
			key: 'year',
			label: 'Year',
			selected: librarySelections.year,
			options: [{ value: '2026', count: 6 }]
		}
	]);
	const LIBRARY_DOC_DETAIL: LibraryDocumentDetail = {
		id: 'doc-1',
		title: 'Trust deed — Rivers Family Trust, deed of variation',
		fields: [
			{ label: 'Content hash', value: 'a3f81c92d4e5b60718aa', mono: true },
			{ label: 'Type', value: 'deed' },
			{ label: 'Catalogued', value: '14/02/2026' }
		],
		tags: ['legal', 'trust'],
		locations: [
			{ path: '/vault/legal/trust-deed.pdf', primary: true },
			{ path: '/archive/2019/trust-deed.pdf', badge: { status: 'warning', label: 'Missing' } }
		],
		memberships: [
			{ id: 'col-7', name: 'household-legal', badge: { status: 'success', label: 'Indexed' } }
		]
	};
	const LIBRARY_COLLECTION: LibraryCollection = {
		id: 'col-7',
		name: 'household-legal',
		subtitle: 'estate · text · active',
		description: 'Deeds, agreements and notices for the household entities.',
		badge: { status: 'success', label: 'Healthy' }
	};

	// `?surface=search-results` (#30) drives the one designed-not-extracted
	// component. The claims that need an engine: the highlight <mark> paints a
	// real tint with real size (a highlight styled into invisibility is the
	// same defect class as SchemaForm's silent fallback), the tint FOLLOWS the
	// consumer's own accent when `--ds-color-primary` is overridden (the
	// sanctioned per-app knob — this is "renders under a consumer's own
	// tokens" measured rather than asserted), and the relevance figure
	// resolves the mono face with tabular numerals.
	const SEARCH_HITS: LibrarySearchResult[] = [
		{
			id: 'hit-1',
			title: 'Trust deed — Rivers Family Trust',
			snippet: [
				{ text: 'The trustee may amend the ' },
				{ text: 'vesting date', highlight: true },
				{ text: ' with the consent of the appointor.' }
			],
			score: 0.92,
			source: 'household-legal',
			meta: 'deed · 2019',
			badges: [{ status: 'success', label: 'Indexed' }]
		},
		{
			id: 'hit-2',
			title: 'Estate planning notes',
			snippet: 'Plain-text passage with no highlight segments at all.',
			score: 0.4,
			source: 'estate-planning'
		}
	];

	// `?surface=palette&palette=<name>` (design-system#25) is the gallery the
	// master project's standalone shadcn showcase used to be: every component
	// across its states, under one of the catalogued palettes, so "what does this
	// look like under palette X" has one answer in one place.
	//
	// The palette is applied the way a consuming app applies it — an attribute on
	// the root element, resolving `:root[data-ds-palette=…]` out of
	// `@poodle64/design-tokens/palettes.css` — and nothing else about the page
	// changes. That is the whole claim: a palette is an accent and a surface
	// tone, and it reaches every component without any component knowing.
	//
	// Set at module scope rather than in an effect, so the first paint is already
	// the right palette and a driver never measures a frame of the default.
	const paletteParam = params.get('palette');
	if (surface === 'palette' && paletteParam) {
		document.documentElement.dataset.dsPalette = paletteParam;
	}
	// `?density=compact` applies the density the way a consuming app does — one
	// attribute on the root element, resolving `[data-ds-density='compact']` out
	// of `@poodle64/ui/styles.css`. Set at module scope for the same reason the
	// palette is: the first paint must already be the right density, or a driver
	// measures a frame of the default and reports it as a dead knob.
	const densityParam = params.get('density');
	if (densityParam) {
		document.documentElement.dataset.dsDensity = densityParam;
	}
	// The swatch grid the showcase had, kept because it is the one part of the
	// page that names tokens rather than components: it gives the driver a stable
	// element per token to read a RESOLVED colour off, which is what turns "the
	// palette renders" into "the palette resolves to these values".
	const SWATCHES = [
		'background',
		'foreground',
		'surface-1',
		'surface-2',
		'surface-3',
		'muted-foreground',
		'border',
		'border-strong',
		'primary',
		'primary-foreground',
		'status-success',
		'status-warning',
		'status-error',
		'status-info',
		'status-neutral'
	] as const;
	const BUTTON_VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;
	const BUTTON_SIZES = ['xs', 'sm', 'default', 'lg'] as const;
	const ICON_SIZES = ['icon-xs', 'icon-sm', 'icon', 'icon-lg'] as const;

	let overlayDialogOpen = $state(false);

	// PageCanvas (#839): a tall receipt in a wide pane (room beside for a
	// label) and an A4 page in a narrow one (no room, so the label falls back
	// above). Inline SVG data URIs: the harness serves no assets, and the
	// claim is about fit/zoom/focus geometry, not about what the picture is.
	const svgPage = (w: number, h: number, bands: [number, number][]) =>
		`data:image/svg+xml;utf8,${encodeURIComponent(
			`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="white"/>${bands
				.map(([y, bh]) => `<rect x="0" y="${y}" width="${w}" height="${bh}" fill="#ddd"/>`)
				.join('')}</svg>`
		)}`;
	const RECEIPT_IMG = svgPage(537, 2339, [
		[80, 60],
		[1100, 40]
	]);
	// A distinct image per page: reusing one `src` across pages never re-fires
	// `onload`, so a page turned to for the first time would never report its
	// own size and stay stuck unmeasured — the exact shape of bug the cross-
	// page focus fix (#839 review, fix 2) needs a second page to expose at all.
	const RECEIPT_IMG_PAGE2 = svgPage(537, 2339, [[400, 80]]);
	const A4_IMG = svgPage(595, 842, [[60, 24]]);
	const receiptRegions: PageCanvasRegion[] = [
		{ id: 'r-header', page: 1, box: { x: 0.05, y: 0.034, w: 0.9, h: 0.026 }, label: 'Header' },
		{ id: 'r-page2', page: 2, box: { x: 0.3, y: 0.1, w: 0.4, h: 0.03 }, label: 'On page 2' }
	];
	const receiptLooked: PageCanvasRegion[] = [
		{ id: 'r-bottom', page: 1, box: { x: 0, y: 0.47, w: 1, h: 0.017 }, label: 'Bottom half' },
		// x > 0, on purpose: a region that does NOT start at the page's own left
		// edge is what exposed the label-offset defect (#839 review, fix 3) —
		// a full-width region (above) never can, since layout.width*(1-0)
		// and the pre-fix left:layout.width+10 formula agree when box.x is 0.
		{ id: 'r-partial', page: 1, box: { x: 0.3, y: 0.6, w: 0.3, h: 0.017 }, label: 'Partial band' }
	];
	const a4Regions: PageCanvasRegion[] = [
		{
			id: 'a-invoice',
			page: 1,
			box: { x: 0.067, y: 0.071, w: 0.866, h: 0.028 },
			label: 'Invoice number'
		}
	];
	let receiptActive = $state<string | null>(null);
	let receiptFocused = $state<string | null>(null);
	let receiptZoom = $state(1);
	let receiptPage = $state(1);
	let a4Active = $state<string | null>(null);
	let a4Focused = $state<string | null>(null);
	let a4Zoom = $state(1);
	// A 1x1 transparent GIF, inline: the harness serves no assets and the claim
	// is about the load-state machine, not about what the picture is.
	const REAL_IMAGE =
		'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
	const LEVELS = [1, 2, 3, 4, 5, 6] as const;

	// 36 is the count from the report: enough that the list is taller than an
	// 800px viewport by a clear margin, so a missing cap cannot be mistaken for
	// a rounding error.
	const LONG_LIST = Array.from({ length: 36 }, (_, i) => `Option ${String(i + 1).padStart(2, '0')}`);

	// The settings destination, in the shape a consuming app uses it: grouped by
	// whose setting it is, the personal group present but EMPTY (an app with no
	// personal sections yet leaves it in and `toGroups` drops it), and enough
	// sections in the last group to overflow a phone so the stacked list has to
	// scroll with the page rather than inside itself.
	const settingsSections: NavSource = [
		{ heading: 'Yours', items: [] },
		{
			heading: 'This company',
			items: [
				{ label: 'Users', href: '#/settings/users', icon: Users },
				{ label: 'Delegation limits', href: '#/settings/delegation-limits', icon: Gavel },
				{ label: 'Overhead suppliers', href: '#/settings/overhead-suppliers', icon: Receipt },
				{ label: 'Breaker events', href: '#/settings/breaker-events', icon: Zap }
			]
		},
		{ heading: 'About', items: [{ label: 'About', href: '#/settings/about', icon: Info }] }
	];
	const settingsPath = params.get('settings') ?? '#/settings/users';

	let phase: 'idle' | 'loading' | 'failed' | 'empty' = $state('idle');

	let paletteOpen = $state(false);
	let collapsed = $state(false);
	let listOpen = $state(true);
	const currentPath = '#/credentials';

	// `?surface=mobile-audit&identity=bare` swaps the fixture below for a
	// caller with no display name, no email and a bare handle — the shape
	// reported live on cadmus (design-system, the phone-shell defect
	// programme, follow-up): AppIdentity's initials must come off the handle
	// rather than off empty text, and never fall back to rendering the handle
	// AS TEXT in the bar. `identity=bare` alone (surface unset) is meaningless
	// and ignored; only `mobile-audit` reads it.
	//
	// `?surface=mobile-audit` — a realistic composed surface for the
	// phone/tablet/desktop sweep (design-system, the phone-shell defect
	// programme): a long rail (nine sections, two carrying children), the
	// `actions` slot holding two StatusBadges, the real AppIdentity in the
	// `identity` slot (not the harness's own hand-rolled stand-in below, which
	// predates AppIdentity's extraction), a ContextColumn, an eight-column
	// DataTableTanstack and a six-card TileGrid. Nothing here is scripted in
	// drive.mjs — it exists to be looked at, per
	// rules-library/core/verification.md "Scripts Drive, Models Judge".
	const auditNav: NavSource = [
		{ label: 'Overview', href: '#/overview', icon: LayoutDashboard },
		{ label: 'Reports', href: '#/reports', icon: ScrollText },
		{
			label: 'Credentials',
			href: '#/credentials',
			icon: Package,
			badge: 3,
			children: [
				{ label: 'Rotations', href: '#/credentials/rotations' },
				{ label: 'Expiring soon', href: '#/credentials/expiring' }
			]
		},
		{ label: 'Identities', href: '#/identities', icon: KeySquare },
		{
			label: 'Education',
			href: '#/education',
			icon: ScrollText,
			children: [
				{ label: 'Open architecture', href: '#/education/open-architecture' },
				{ label: 'Autonomy', href: '#/education/autonomy' }
			]
		},
		{ label: 'Audit', href: '#/audit', icon: ScrollText },
		{ label: 'Marketplace', href: '#/marketplace', icon: Package },
		{ label: 'Library', href: '#/library', icon: BookOpen },
		{ label: 'Intelligence', href: '#/intelligence', icon: LayoutDashboard },
		{ label: 'Records', href: '#/records', icon: ScrollText }
	];

	interface AuditRow {
		id: string;
		account: string;
		platform: string;
		owner: string;
		status: string;
		opened: string;
		realised: number;
		unrealised: number;
		events: number;
	}
	const AUDIT_ROWS: AuditRow[] = Array.from({ length: 14 }, (_, i) => ({
		id: `row-${i}`,
		account: `Broker ${String.fromCharCode(65 + (i % 4))} ${1000001 + i}`,
		platform: ['cTrader', 'IRESS', 'MT5', 'TWS'][i % 4],
		owner: ['Trust', 'Individual', 'Joint', 'SMSF'][i % 4],
		status: i % 5 === 0 ? 'Dormant' : 'Active',
		opened: `${(i % 28) + 1}/0${(i % 9) + 1}/2026`,
		realised: 321857.83 - i * 25412.6,
		unrealised: i % 3 === 0 ? -4159.25 * i : 1875.4 * i,
		events: 2014 - i * 130
	}));
	const auditColumns: ColumnDef<AuditRow>[] = [
		{ accessorKey: 'account', header: 'Account' },
		{ accessorKey: 'platform', header: 'Platform' },
		{ accessorKey: 'owner', header: 'Owner' },
		{ accessorKey: 'status', header: 'Status' },
		{ accessorKey: 'opened', header: 'Opened' },
		{ accessorKey: 'realised', header: 'Realised' },
		{ accessorKey: 'unrealised', header: 'Unrealised' },
		{ accessorKey: 'events', header: 'Events' }
	];
	const auditTable = createSvelteTable<AuditRow>({
		data: AUDIT_ROWS,
		columns: auditColumns,
		getCoreRowModel: getCoreRowModel()
	});

	const AUDIT_CARDS = [
		{ title: 'Marketplace', body: 'The strategy paper and the working papers underneath.' },
		{ title: 'Library', body: 'The primary-source evidence base behind the strategy.' },
		{ title: 'Education', body: 'Autonomy and open-architecture education library.' },
		{ title: 'Leave', body: 'Chapter 5 leave planning — service history and balances.' },
		{ title: 'Intelligence', body: 'The entity/assertion knowledge graph, cut temporally.' },
		{ title: 'Records', body: 'Preserved activity, kept as a record.' }
	];

	const AUDIT_STATS: StatItem[] = [
		{ label: 'Accounts', value: 14 },
		{ label: 'Active', value: 11, status: 'success' },
		{ label: 'Dormant', value: 3, status: 'warning' },
		{ label: 'Net gain', value: '$41,275.60', status: 'success' }
	];

	// The theme follows the OS preference, and a driver picks it by emulating
	// `prefers-color-scheme` rather than by passing a mode here.
	//
	// This used to read `defaultMode="dark"`, which was measurably not doing
	// what it says: mode-watcher tracks the system preference, and Chromium's
	// default is light, so every surface in this harness has in fact been
	// rendering LIGHT since the day it was written. The contrast gate has to
	// visit both themes and be certain which one it is looking at, so the lever
	// is now the one that actually moves — `browser.newContext({ colorScheme })`.
</script>

<ModeWatcher defaultMode="system" />

{#if surface === 'detail-panel'}
	<!-- design-system#9: DetailPanel's title face is a class-name choice
	     (font-mono vs font-display), which is exactly the shape of dead
	     utility this package's other gates guard against — the class can be
	     present in the DOM with no compiled rule behind it. Two panels, one
	     per supported titleFace, so the CLAIM (a resolved computed
	     font-family, not a class string) is measured. -->
	<div class="flex flex-col gap-4 p-8">
		<div data-probe="mono">
			<DetailPanel title="record-42">
				<p>Default (mono) body</p>
			</DetailPanel>
		</div>
		<div data-probe="display">
			<DetailPanel title="Jordan Rivers" titleFace="display">
				<p>Display body</p>
			</DetailPanel>
		</div>
	</div>
{:else if surface === 'page-canvas'}
	<!-- design-system#839: PageCanvas's whole reason to exist is pixel
	     geometry — the whole-page fit, the beside/above label choice, and the
	     focus-and-centre zoom — none of which jsdom can see (it never lays
	     anything out, so bind:clientWidth/clientHeight read 0 and the
	     component's `layout` derivation never leaves null there). Two panes:
	     a tall receipt in a WIDE pane (room beside the page for a label) and
	     an A4 page in a NARROW one (no room, so the label falls back above).
	     Scripted in drive.mjs. -->
	<div class="flex flex-wrap items-start gap-8 p-8">
		<div class="flex flex-col gap-2">
			<p class="text-sm">Receipt, wide pane (label beside)</p>
			<div data-probe="receipt" style="width: 480px; height: 640px; border: 1px solid #ccc;">
				<PageCanvas
					pageCount={2}
					bind:currentPage={receiptPage}
					regions={receiptRegions}
					lookedRegions={receiptLooked}
					bind:activeRegionId={receiptActive}
					bind:focusedRegionId={receiptFocused}
					bind:zoom={receiptZoom}
					class="h-full w-full"
				>
					{#snippet page(pageNumber, info)}
						<img
							src={pageNumber === 2 ? RECEIPT_IMG_PAGE2 : RECEIPT_IMG}
							alt="receipt"
							style="width: {info.size.width ? info.size.width + 'px' : 'auto'}; height: {info
								.size.height
								? info.size.height + 'px'
								: 'auto'};"
							onload={(e) =>
								info.reportSize(
									(e.currentTarget as HTMLImageElement).naturalWidth,
									(e.currentTarget as HTMLImageElement).naturalHeight
								)}
						/>
					{/snippet}
				</PageCanvas>
			</div>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					data-action="hover-header"
					onclick={() => (receiptActive = receiptActive === 'r-header' ? null : 'r-header')}
					>Hover Header</button
				>
				<button
					type="button"
					data-action="focus-page2"
					onclick={() => (receiptFocused = receiptFocused === 'r-page2' ? null : 'r-page2')}
					>Focus region on page 2</button
				>
				<button
					type="button"
					data-action="hover-page2"
					onclick={() => (receiptActive = receiptActive === 'r-page2' ? null : 'r-page2')}
					>Hover region on page 2</button
				>
				<button type="button" data-action="zoom-300-receipt" onclick={() => (receiptZoom = 3)}
					>Zoom to 300%</button
				>
			</div>
		</div>
		<div class="flex flex-col gap-2">
			<p class="text-sm">A4, narrow pane (label above)</p>
			<div data-probe="a4" style="width: 480px; height: 460px; border: 1px solid #ccc;">
				<PageCanvas
					pageCount={1}
					regions={a4Regions}
					bind:activeRegionId={a4Active}
					bind:focusedRegionId={a4Focused}
					bind:zoom={a4Zoom}
					class="h-full w-full"
				>
					{#snippet page(_pageNumber, info)}
						<img
							src={A4_IMG}
							alt="a4"
							style="width: {info.size.width ? info.size.width + 'px' : 'auto'}; height: {info
								.size.height
								? info.size.height + 'px'
								: 'auto'};"
							onload={(e) =>
								info.reportSize(
									(e.currentTarget as HTMLImageElement).naturalWidth,
									(e.currentTarget as HTMLImageElement).naturalHeight
								)}
						/>
					{/snippet}
				</PageCanvas>
			</div>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					data-action="focus-invoice"
					onclick={() => (a4Focused = a4Focused === 'a-invoice' ? null : 'a-invoice')}
					>Focus Invoice number</button
				>
				<!-- A4's wider aspect (unlike the tall, narrow receipt) genuinely
				     overflows this pane HORIZONTALLY at 300%, so this pane proves
				     the fix's other axis. -->
				<button type="button" data-action="zoom-300-a4" onclick={() => (a4Zoom = 3)}
					>Zoom to 300%</button
				>
			</div>
		</div>
	</div>
{:else if surface === 'fact-grid'}
	<!-- design-system#839: the borderless-inside-a-Panel claim (no double
	     border) and the numeric/plain-words face split need a real cascade to
	     resolve font-family and border colour; kept short since the geometry
	     (col-span-full) is already proved under jsdom in fact-grid.test.ts. -->
	<div class="max-w-2xl p-8">
		<Panel title="What it read">
			<FactGrid
				facts={[
					{ key: 'store', label: 'Store', value: 'Aldi' },
					{ key: 'date', label: 'Date', value: '18/09/2026' },
					{ key: 'total', label: 'Total', value: '175.98', numeric: true },
					{
						key: 'address',
						label: 'Address',
						value: '221B Baker Street, Marylebone, London NW1 6XE'
					}
				]}
			/>
		</Panel>
	</div>
{:else if surface === 'theming'}
	<!-- design-system#8: scoped theming. jsdom cannot make either claim here —
	     it applies no stylesheet, so it never resolves a var() chain at all,
	     and it has no cascade to distinguish "declared at :root" from
	     "declared on this element's ancestor". Three identical probe sets:
	     the page default, a subtree overriding --ds-color-* only, and a
	     subtree carrying a scoped .dark class — proving the ONE documented
	     lever (--ds-color-*) reaches every shadcn colour utility this
	     package ships, in a scope smaller than the page, on both halves of
	     the surface (bg-background/text-muted-foreground/border-input are
	     @poodle64/design-tokens' own keys; bg-card/bg-popover/bg-muted/
	     bg-accent/bg-secondary are @poodle64/ui's). -->
	{#snippet probes(probe: string)}
		<div data-probe={probe} class="flex flex-wrap gap-2 p-2">
			<div data-slot="bg-background" class="bg-background p-2">background</div>
			<div data-slot="bg-card" class="bg-card p-2">card</div>
			<div data-slot="bg-popover" class="bg-popover p-2">popover</div>
			<div data-slot="bg-muted" class="bg-muted p-2">muted</div>
			<div data-slot="bg-accent" class="bg-accent p-2">accent</div>
			<div data-slot="bg-secondary" class="bg-secondary p-2">secondary</div>
			<div data-slot="border-input" class="border-input border-4 p-2">input</div>
			<div data-slot="text-muted-foreground" class="text-muted-foreground p-2">muted-foreground</div>
		</div>
	{/snippet}
	<div class="flex flex-col gap-4 p-8">
		<div data-probe="root">{@render probes('root')}</div>
		<div
			data-probe="scoped-ds-color"
			style="--ds-color-background: oklch(0.55 0.2 30); --ds-color-surface-1: oklch(0.55 0.2 30); --ds-color-surface-2: oklch(0.55 0.2 30); --ds-color-surface-3: oklch(0.55 0.2 30); --ds-color-border: oklch(0.55 0.2 30); --ds-color-muted-foreground: oklch(0.55 0.2 30); --ds-color-primary: oklch(0.55 0.2 30);"
		>
			{@render probes('scoped-ds-color')}
		</div>
		<div data-probe="scoped-dark" class="dark">
			{@render probes('scoped-dark')}
		</div>
	</div>
{:else if surface === 'overlays'}
	<div class="flex flex-col items-start gap-4 p-8">
		<button type="button" onclick={() => (overlayDialogOpen = true)}>Open dialog</button>
		<AppDialog bind:open={overlayDialogOpen} title="Overlay dialogue">
			<p>Dialogue body</p>
		</AppDialog>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger>Open menu</DropdownMenu.Trigger>
			<DropdownMenu.Content>
				<DropdownMenu.Item>Menu body</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<Popover.Root>
			<Popover.Trigger>Open popover</Popover.Trigger>
			<Popover.Content>Popover body</Popover.Content>
		</Popover.Root>

		<Select.Root type="single">
			<Select.Trigger>Open select</Select.Trigger>
			<Select.Content>
				<Select.Item value="a" label="Select body">Select body</Select.Item>
			</Select.Content>
		</Select.Root>
	</div>
{:else if surface === 'long-lists'}
	<!-- Every floating overlay this package ships, each holding more rows than
	     fit. The triggers sit near the top so the popper has the whole viewport
	     below it to overflow into: an overlay opening from the bottom edge would
	     flip above the trigger and could fit by accident, which would prove
	     nothing. -->
	<div class="flex flex-wrap items-start gap-4 p-6">
		<Select.Root type="single">
			<Select.Trigger>Open select</Select.Trigger>
			<Select.Content>
				{#each LONG_LIST as option (option)}
					<Select.Item value={option} label={option}>{option}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger>Open menu</DropdownMenu.Trigger>
			<DropdownMenu.Content>
				{#each LONG_LIST as option (option)}
					<DropdownMenu.Item>{option}</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<Popover.Root>
			<Popover.Trigger>Open popover</Popover.Trigger>
			<Popover.Content>
				{#each LONG_LIST as option (option)}
					<p>{option}</p>
				{/each}
			</Popover.Content>
		</Popover.Root>

		<button type="button" onclick={() => (paletteOpen = true)}>Open command</button>
		<Command.Dialog bind:open={paletteOpen} title="Long command list" description="Search">
			<Command.Input placeholder="Search" />
			<Command.List>
				<Command.Empty>Nothing matched.</Command.Empty>
				<Command.Group heading="Options">
					{#each LONG_LIST as option (option)}
						<Command.Item value={option}>{option}</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Dialog>
	</div>
{:else if surface === 'avatar'}
	<div class="flex items-center gap-4 p-8">
		<div data-probe="avatar-broken">
			<Avatar>
				<AvatarImage src="/definitely-not-here.png" alt="Operator" />
				<AvatarFallback>OP</AvatarFallback>
			</Avatar>
		</div>
		<div data-probe="avatar-loaded">
			<Avatar>
				<AvatarImage src={REAL_IMAGE} alt="Operator" />
				<AvatarFallback>OP</AvatarFallback>
			</Avatar>
		</div>
		<div data-probe="avatar-sourceless">
			<Avatar>
				<AvatarFallback>OP</AvatarFallback>
			</Avatar>
		</div>
	</div>
{:else if surface === 'overflow'}
	<AppShell {nav} currentPath="#/overview" brandTitle="Harness">
		<!-- A consumer-shaped page: the root wrapper an app writes, holding
		     something wider than a phone. `wrapper=auto` adds the `mx-auto`
		     centring that is the ordinary way to cap a measure and the second,
		     independent mechanism behind the overflow. -->
		<div class={wrapper === 'auto' ? 'mx-auto w-full max-w-[80rem]' : ''} data-probe="page-wrapper">
			<h1 class="font-display text-display font-semibold">Wide page</h1>
			{#if overflowContent === 'word'}
				<p data-probe="long-word" class="text-sm">
					pneumonoultramicroscopicsilicovolcanoconiosisandthensomemoreforgoodmeasure
				</p>
			{/if}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						{#each ['Identifier', 'Owner', 'Environment', 'Rotated', 'Expires', 'Consumer', 'Scope', 'Status'] as head (head)}
							<Table.Head>{head}</Table.Head>
						{/each}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each [1, 2, 3] as row (row)}
						<Table.Row>
							{#each ['credential-alpha-00' + row, 'platform', 'production', '2026-07-01', '2027-07-01', 'gateway', 'read:all', 'active'] as cell (cell)}
								<Table.Cell>{cell}</Table.Cell>
							{/each}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</AppShell>
{:else if surface === 'card'}
	<div class="flex flex-col gap-4 p-8">
		<!-- Seven cards built from the identical snippet of markup, differing in
		     one prop. Same width container, same siblings, same body, so a
		     measured difference in the title can only have come from the tag
		     name. -->
		<div class="w-96" data-probe="div">
			<Card>
				<CardHeader>
					<CardTitle>Estate summary</CardTitle>
					<CardDescription>Everything under management.</CardDescription>
				</CardHeader>
				<CardContent>Body copy under the title.</CardContent>
			</Card>
		</div>
		{#each LEVELS as level (level)}
			<div class="w-96" data-probe={`h${level}`}>
				<Card>
					<CardHeader>
						<CardTitle {level}>Estate summary</CardTitle>
						<CardDescription>Everything under management.</CardDescription>
					</CardHeader>
					<CardContent>Body copy under the title.</CardContent>
				</Card>
			</div>
		{/each}
	</div>
{:else if surface === 'states'}
	<div class="flex flex-col gap-4 p-8">
		<div class="flex gap-2">
			<button type="button" onclick={() => (phase = 'loading')}>Start load</button>
			<button type="button" onclick={() => (phase = 'failed')}>Fail the load</button>
			<button type="button" onclick={() => (phase = 'empty')}>Settle with no rows</button>
		</div>
		{#if phase === 'loading'}
			<LoadingState message="Fetching records…" />
		{:else if phase === 'failed'}
			<ErrorState message="Could not load the estate." />
		{:else if phase === 'empty'}
			<EmptyState title="No records" description="Nothing matched that filter." />
		{/if}
	</div>
{:else if surface === 'console'}
	<div class="flex flex-col gap-6 p-8">
		<div class="flex items-center gap-4">
			{#each ARC_TONES as tone (tone)}
				<div data-probe="arc-{tone}">
					<ArcGauge pct={65} {tone} size={42} showLabel label="5h" />
				</div>
			{/each}
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#each BADGE_STATUSES as status (status)}
				<div data-probe="badge-{status}">
					<StatusBadge {status} label={status} />
				</div>
			{/each}
		</div>
		<div class="w-96" data-probe="bar-row">
			<BarRow label="Lane A" value="42%" pct={42} />
		</div>
		<div data-probe="scorecard">
			<Scorecard scores={[0, 1, 2, 1, 0]} />
		</div>
		<div data-probe="sparkline">
			<Sparkline
				series={[{ vals: [2, 8, 4, 10, 6], color: 'var(--ds-color-status-success)' }]}
				width={160}
				height={40}
			/>
		</div>
	</div>
{:else if surface === 'schema-form'}
	<!-- Two documents, one of them deliberately part-broken: an unregistered
	     `dropdown` hint, an `Accordion` element nothing knows, and a `retention`
	     group no Control addresses. All three must be the loudest things on the
	     page, and that is a claim about paint, not about markup. -->
	<div class="mx-auto max-w-2xl p-8" data-probe="schema-form">
		<SchemaForm
			schema={SCHEMA_FORM_SCHEMA}
			uischema={SCHEMA_FORM_UI}
			value={schemaFormValue}
			onChange={(next) => (schemaFormValue = next)}
		/>
	</div>
{:else if surface === 'library'}
	<!-- #30: the consumer-shaped flow. The shell is here because a real
	     consumer renders these inside it, and the 375px overflow claim is
	     meaningless against a bare page. -->
	<AppShell {nav} currentPath="#/overview" brandTitle="Harness">
		{#if libraryView === 'browse'}
			<div data-probe="library-browse">
				<LibraryBrowse
					documents={LIBRARY_DOCUMENTS}
					facets={libraryFacets}
					query={libraryQuery}
					total={LIBRARY_DOCUMENTS.length}
					onQueryChange={(q) => (libraryQuery = q)}
					onFacetChange={(key, selected) =>
						(librarySelections = { ...librarySelections, [key]: selected })}
					onOpenDocument={() => (libraryView = 'document')}
				/>
			</div>
		{:else if libraryView === 'document'}
			<div data-probe="library-document">
				<DocumentDetail
					document={LIBRARY_DOC_DETAIL}
					onOpenCollection={() => (libraryView = 'collection')}
				/>
			</div>
		{:else}
			<div data-probe="library-collection">
				<CollectionDetail
					collection={LIBRARY_COLLECTION}
					stats={[
						{ label: 'Documents', value: 3 },
						{ label: 'Failed', value: 0, status: 'error', muted: true }
					]}
					documents={LIBRARY_DOCUMENTS}
				/>
			</div>
		{/if}
	</AppShell>
{:else if surface === 'search-results'}
	<div class="mx-auto max-w-2xl p-8" data-probe="search-results">
		<SearchResults results={SEARCH_HITS} query="vesting date" total={12} onOpen={() => {}} />
	</div>
{:else if surface === 'palette'}
	<!-- The palette gallery (design-system#25), inside the shell rather than on a
	     bare page: the nav ink sits on the chrome's own tinted surface, which is
	     the composite #11 exists for, and it has to be measured under EVERY
	     catalogued palette rather than the three fixtures that section carries. -->
	<AppShell {nav} {currentPath} brandTitle="Palette">
		{#snippet identity()}
			<button class="flex w-full items-center gap-2.5 px-3 py-3 text-sm" data-testid="identity">
				<span
					class="bg-primary/15 text-primary grid size-8 flex-none place-items-center rounded-full text-xs font-semibold"
					>OP</span
				>
				<span>Operator</span>
			</button>
		{/snippet}
		<div class="flex flex-col gap-8" data-probe="palette-gallery">
			<div>
				<h1 class="font-display text-display font-semibold" data-probe="palette-title">
					{DS_PALETTES.find((p) => p.name === paletteParam)?.title ?? 'Package default'}
				</h1>
				<p class="text-muted-foreground mt-2 text-sm" data-probe="palette-strategy">
					{DS_PALETTES.find((p) => p.name === paletteParam)?.strategy ?? 'No palette applied'}
				</p>
			</div>

			<!-- Swatches first: the tokens, before anything built out of them. Each
			     carries its own `data-swatch`, so the driver reads a resolved colour
			     per token instead of inferring one from a component that happens to
			     use it. -->
			<section class="flex flex-wrap gap-3" data-probe="swatches">
				{#each SWATCHES as token (token)}
					<div class="flex w-32 flex-col gap-1">
						<div
							data-swatch={token}
							class="border-border h-12 rounded-md border"
							style="background: var(--ds-color-{token})"
						></div>
						<span class="text-muted-foreground text-2xs">{token}</span>
					</div>
				{/each}
			</section>

			<Separator />

			<section class="flex flex-col gap-3" data-probe="buttons">
				{#each BUTTON_SIZES as size (size)}
					<div class="flex flex-wrap items-center gap-2">
						{#each BUTTON_VARIANTS as variant (variant)}
							<Button {variant} {size} data-probe="button-{variant}-{size}">{variant}</Button>
						{/each}
						<Button variant="default" {size} disabled data-probe="button-disabled-{size}">
							disabled
						</Button>
						<!-- The icon-adjacent trim is a separate rung of the ramp, and it
						     is the one that goes wrong quietly: a density that moves the
						     side padding but not the trim leaves an icon button with MORE
						     room beside its glyph than beside a word. -->
						<Button variant="outline" {size} data-probe="button-icon-inline-end-{size}">
							with icon
							<Package data-icon="inline-end" />
						</Button>
					</div>
				{/each}
				<div class="flex flex-wrap items-center gap-2">
					{#each ICON_SIZES as size (size)}
						<Button variant="outline" {size} data-probe="button-{size}" aria-label={size}>
							<Package />
						</Button>
					{/each}
				</div>
			</section>

			<!-- design-system: the tab strip. Its selected trigger is painted
			     entirely by `data-active:` utilities, which matched nothing until the
			     mapping covered the value — so every trigger rendered identically and
			     the strip told a reader nothing. That is a claim about a COMPOSITED
			     fill, not about a class, so it is measured here rather than in jsdom. -->
			<section data-probe="tabs">
				<Tabs.Root value="one">
					<Tabs.List>
						<Tabs.Trigger value="one" data-probe="tab-active">Selected</Tabs.Trigger>
						<Tabs.Trigger value="two" data-probe="tab-inactive">Not selected</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="one">The selected panel.</Tabs.Content>
					<Tabs.Content value="two">The other panel.</Tabs.Content>
				</Tabs.Root>
			</section>

			<section class="flex flex-wrap items-end gap-4" data-probe="form">
				<div class="flex flex-col gap-1.5">
					<Label for="palette-text">Text input</Label>
					<Input id="palette-text" placeholder="Placeholder copy" data-probe="input" />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label for="palette-disabled">Disabled</Label>
					<Input id="palette-disabled" value="Locked" disabled />
				</div>
				<div class="flex items-center gap-2">
					<Checkbox id="palette-check" checked data-probe="checkbox" />
					<Label for="palette-check">Checked</Label>
				</div>
				<div class="flex items-center gap-2">
					<Checkbox id="palette-uncheck" data-probe="checkbox-unchecked" />
					<Label for="palette-uncheck">Unchecked</Label>
				</div>
				<div class="flex items-center gap-2">
					<Checkbox id="palette-mixed" indeterminate data-probe="checkbox-indeterminate" />
					<Label for="palette-mixed">Mixed</Label>
				</div>
				<div class="flex items-center gap-2">
					<Checkbox id="palette-invalid" aria-invalid="true" data-probe="checkbox-invalid" />
					<Label for="palette-invalid">Invalid</Label>
				</div>
				<div class="flex items-center gap-2">
					<Switch id="palette-switch" checked data-probe="switch" />
					<Label for="palette-switch">On</Label>
				</div>
				<div class="flex items-center gap-2">
					<Switch id="palette-switch-sm" size="sm" checked data-probe="switch-sm" />
					<Label for="palette-switch-sm">On, small</Label>
				</div>
				<div class="flex items-center gap-2">
					<Switch id="palette-switch-invalid" aria-invalid="true" data-probe="switch-invalid" />
					<Label for="palette-switch-invalid">Invalid</Label>
				</div>
			</section>

			<section class="flex flex-wrap items-center gap-2" data-probe="badges">
				{#each BADGE_STATUSES as status (status)}
					<StatusBadge {status} label={status} />
				{/each}
				<Badge>Badge</Badge>
				<Badge variant="outline">Outline</Badge>
			</section>

			<section class="flex flex-col gap-3" data-probe="alerts">
				<Alert>
					<AlertTitle>An ordinary notice</AlertTitle>
					<AlertDescription>Body copy on the alert surface.</AlertDescription>
				</Alert>
				<Alert variant="destructive">
					<AlertTitle>Something went wrong</AlertTitle>
					<AlertDescription>The destructive variant, unchanged by the palette.</AlertDescription>
				</Alert>
			</section>

			<section class="flex flex-wrap gap-4" data-probe="cards">
				<div class="w-80">
					<Card>
						<CardHeader>
							<CardTitle level={2}>Card on the ground</CardTitle>
							<CardDescription>Secondary copy in muted-foreground.</CardDescription>
						</CardHeader>
						<CardContent>
							<p class="text-sm" data-probe="card-body">Body copy at the ordinary text size.</p>
							<div class="bg-muted mt-3 rounded-md p-3" data-probe="card-nested">
								<p class="text-muted-foreground text-sm">A nested well inside the card.</p>
							</div>
						</CardContent>
					</Card>
				</div>
				<!-- A CLICKABLE card wearing the ordinary shadcn hover treatment
				     (design-system#24). This is the one that has to change colour
				     under a pointer; a rest-state screenshot cannot catch it. -->
				<div class="w-80">
					<Card class="hover:bg-accent/50 cursor-pointer" data-probe="card-interactive">
						<CardHeader>
							<CardTitle level={2}>Clickable card</CardTitle>
							<CardDescription>Hover me.</CardDescription>
						</CardHeader>
						<CardContent>
							<p class="text-sm">The hover fill has to differ from the rest fill.</p>
						</CardContent>
					</Card>
				</div>
				<div class="w-80">
					<Card>
						<CardHeader>
							<CardTitle level={2}>Loading</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="flex flex-col gap-2">
								<Skeleton class="h-4 w-full" />
								<Skeleton class="h-4 w-2/3" />
							</div>
						</CardContent>
					</Card>
				</div>
			</section>

			<section data-probe="table">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							{#each ['Identifier', 'Owner', 'Rotated', 'Status'] as head (head)}
								<Table.Head>{head}</Table.Head>
							{/each}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each ['alpha', 'beta', 'gamma'] as row (row)}
							<Table.Row>
								<Table.Cell>credential-{row}</Table.Cell>
								<Table.Cell>platform</Table.Cell>
								<Table.Cell>2026-07-01</Table.Cell>
								<Table.Cell><StatusBadge status="success" label="active" /></Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</section>
		</div>
	</AppShell>
{:else if surface === 'nested'}
	<!-- The path is inside the Education section, so the group is open on first
	     paint with nothing having been clicked — the derived default, which is
	     the whole reason a stored one was rejected. -->
	<AppShell
		nav={nestedNav}
		{collapsible}
		bind:collapsed
		currentPath="#/education/topic-3"
		brandTitle="Harness"
	>
		<h1 class="font-display text-display font-semibold">Education</h1>
		<p class="text-muted-foreground mt-2 text-sm">A section with its own navigation.</p>
	</AppShell>
{:else if surface === 'measure'}
	<!-- One page body, four caps, so the only thing that can move a measured
	     width is the prop. The copy is real running text rather than a filler
	     block because `prose` is stated in `ch` — a claim about how many
	     characters land on a line, which only means anything against characters
	     in the face the app actually set. -->
	<AppShell {nav} currentPath="#/overview" brandTitle="Harness" measure={measureParam}>
		<h1 class="font-display text-display font-semibold">Measure</h1>
		<p data-probe="measure-copy" class="text-muted-foreground mt-2 text-sm">
			The shell owns the content measure so that pages stop each deciding their own. A cap
			written at the top of a page is invisible to every other page, which is how one app ended
			up with six different answers to the same question and no way to tell which was
			deliberate.
		</p>

		<!-- HTML the app did not author, wearing the shared reading face
		     (design-system#32). Composed with `.ds-measure` rather than the face
		     baking a measure in: a reading face and a reading width are two
		     decisions. -->
		<div
			data-probe="prose"
			class="ds-prose ds-measure mt-8"
			data-measure="prose"
		>
			<h2 data-probe="prose-h2">An extracted heading</h2>
			<p>Body copy as it arrives from a document, with <code data-probe="prose-code">inline code</code> and a <a href="#/overview" data-probe="prose-link">link</a>.</p>
			<ul data-probe="prose-list">
				<li>A bullet that must still show its marker</li>
			</ul>
			<blockquote data-probe="prose-quote">A quoted passage.</blockquote>
			<div data-probe="prose-table-wrap">
				<table data-probe="prose-table">
					<thead>
						<tr>{#each Array(14) as _, i (i)}<th>Column heading {i}</th>{/each}</tr>
					</thead>
					<tbody>
						<tr>{#each Array(14) as _, i (i)}<td>A reasonably long cell {i}</td>{/each}</tr>
					</tbody>
				</table>
			</div>
		</div>

		<!-- A prose block INSIDE the page, on a route that may legitimately be
		     `wide` (design-system#22). `.ds-measure` caps it at the same 72ch the
		     shell would use and leaves it where it is; `.ds-shell-measure` would
		     also centre it, which is right for the content box and wrong here. -->
		<div data-probe="measure-block-wrap" class="mt-6">
			<p data-probe="measure-block" class="ds-measure text-sm" data-measure="prose">
				A block set to the reading measure inside a page whose own measure is wider. The cap
				comes from the same custom property the shell reads, so retuning the scale moves this
				paragraph too, which a locally written max-width would not.
			</p>
		</div>
	</AppShell>
{:else if surface === 'texture'}
	<!-- One shell, one very tall page, the texture the only variable. The body is
	     3200px so the content region genuinely scrolls at every viewport driven,
	     and under `?blank=1` it holds nothing but that height — a strip
	     photographed at two scroll offsets then contains only floor, so a
	     difference between the two photographs can only be the texture moving. -->
	<AppShell {nav} currentPath="#/overview" brandTitle="Harness" texture={textureParam}>
		{#if !textureBlank}
			<h1 class="font-display text-display font-semibold">Texture</h1>
			<p class="text-muted-foreground mt-2 text-sm">
				The shell paints the house atmosphere once, on the region that scrolls, so an app cannot
				end up wearing it on some routes and not others.
			</p>
			<div class="bg-card border-border ds-edge mt-6 rounded-lg border p-4" data-probe="texture-card">
				<p class="text-sm">A card on the floor: content paints over the texture, never under it.</p>
				<button class="border-border mt-3 rounded-md border px-3 py-1.5 text-sm" data-probe="texture-button">
					A control the texture must not swallow
				</button>
			</div>
		{/if}
		<!-- `flex: none` is load-bearing, not tidiness: the content box is a flex
		     column, and an empty child's min-content height is zero, so a bare
		     `height` shrinks straight back to nothing and the page never scrolls.
		     The first run of the driver caught exactly that. -->
		<div data-probe="texture-spacer" style="height: 3200px; flex: none"></div>
	</AppShell>
{:else if surface === 'mobile-audit'}
	<AppShell
		nav={auditNav}
		{collapsible}
		bind:collapsed
		currentPath="#/reports"
		brandTitle="Cadmus"
		measure="wide"
		onSearch={() => (paletteOpen = true)}
	>
		{#snippet actions()}
			<StatusBadge status="success" label="Synced" />
			<StatusBadge status="warning" label="3 pending" />
		{/snippet}
		{#snippet identity()}
			<AppIdentity
				user={identityParam === 'bare'
					? { username: 'r-hendriks', display_name: null, email: null }
					: {
							username: 'operator',
							display_name: 'Operator',
							email: 'operator@example.invalid'
						}}
				workspace="Household"
				role="owner"
				entitlements={['admin']}
				onSignOut={() => {}}
			/>
		{/snippet}
		<!-- The page's scope in the bar; with the Entity trigger beside it, the
		     shape a finance page carries. -->
		<ShellControls>
			<button
				class="border-border bg-surface-1 flex h-7 flex-none items-center gap-1.5 rounded-md border px-2.5 text-xs whitespace-nowrap"
				data-probe="audit-entity"
			>
				<span class="text-muted-foreground">Entity</span><span>All entities</span>
			</button>
			<Segmented
				bind:value={auditYear}
				options={[
					{ value: 'FY24', label: 'FY24' },
					{ value: 'FY25', label: 'FY25' },
					{ value: 'FY26', label: 'FY26' }
				]}
				label="Financial year"
				size="sm"
			/>
		</ShellControls>
		<div class="flex min-h-0 flex-1 gap-6">
			<div class="min-w-0 flex-1">
				<h1 class="font-display text-display font-semibold">Reports</h1>
				<p class="text-muted-foreground mt-1 mb-6 text-sm" data-probe="audit-table-caption">
					Eight columns, fourteen rows.
				</p>
				<div class="h-[420px]" data-probe="audit-table">
					<DataTableTanstack table={auditTable} getRowId={(r) => r.id} />
				</div>

				<h2 class="font-display mt-10 text-xl font-semibold">Portfolios</h2>
				<TileGrid min="16rem" gap="1rem" class="mt-4" data-probe="audit-tile-grid">
					{#each AUDIT_CARDS as c (c.title)}
						<Card>
							<CardHeader>
								<CardTitle level={3}>{c.title}</CardTitle>
								<CardDescription>{c.body}</CardDescription>
							</CardHeader>
						</Card>
					{/each}
				</TileGrid>
			</div>
			<ContextColumn stats={AUDIT_STATS} ariaLabel="Report context" />
		</div>
	</AppShell>

	<CommandPalette
		bind:open={paletteOpen}
		nav={auditNav}
		onNavigate={(href) => (location.hash = href.slice(1))}
	/>
{:else if surface === 'list-shell'}
	<!--
		design-system: the working-list companion to SettingsShell
		(radar-hooves/godswood#839). `padded={false}` for the same reason
		SettingsShell needs it — ListShell has to reach the content area's edge,
		flush against the rail, or it reads as a floating card. `?open=0` drives
		the folded state directly (a real click is also exercised, but a
		reload-survival claim needs the closed state reachable on first paint).
	-->
	<AppShell
		nav={[{ label: 'Home', href: '#/overview', icon: LayoutDashboard }]}
		currentPath="#/overview"
		brandTitle="Godswood"
		padded={false}
	>
		<div class="flex min-h-0 flex-1">
			<ListShell title="Waiting on you" bind:open={listOpen}>
				{#snippet actions()}
					<button
						type="button"
						aria-label="Add documents"
						title="Add documents"
						class="border-border grid size-9 flex-none place-items-center rounded-md border"
					>
						<Plus class="size-4" />
					</button>
				{/snippet}
				<div class="px-5 pb-3.5">
					<div role="tablist" aria-label="Which documents" class="bg-muted/40 flex gap-1 rounded-lg p-1">
						<button type="button" role="tab" aria-selected="true" class="bg-card flex-1 rounded-md py-1.5 text-sm font-semibold">
							Waiting <span class="text-muted-foreground font-normal">338</span>
						</button>
						<button type="button" role="tab" aria-selected="false" class="text-muted-foreground flex-1 rounded-md py-1.5 text-sm">
							Filed <span class="font-normal">1500</span>
						</button>
					</div>
				</div>
				<div class="text-shell-muted-foreground px-5 pt-2 pb-1.5 text-xs font-semibold">
					Needs an answer <span class="font-normal">118</span>
				</div>
				{#each [{ t: 'eBay purchase history', s: 'Which property are these purchases for?', d: '25/12/2021' }, { t: 'Vehicle registration renewal', s: 'A 2016 renewal reminder for a 2004 Ford sedan…', d: '16/04/2016' }] as row (row.t)}
					<button type="button" class="border-border flex w-full gap-3.5 border-t px-5 py-3 text-left">
						<span class="min-w-0 flex-1">
							<span class="block font-medium">{row.t}</span>
							<span class="text-muted-foreground mt-0.5 block truncate text-xs">{row.s}</span>
						</span>
						<span class="text-shell-muted-foreground shrink-0 text-xs">{row.d}</span>
					</button>
				{/each}
				<div class="text-shell-muted-foreground px-5 pt-3 pb-1.5 text-xs font-semibold">
					Ready to file <span class="font-normal">214</span>
				</div>
				{#each [{ t: 'Aldi receipt', s: 'Grocery receipt · 1 page', d: '18/09/2026', active: true }, { t: 'Gas rates change notice', s: 'Document · 2 pages', d: '20/06/2024', active: false }] as row (row.t)}
					<button
						type="button"
						aria-current={row.active ? 'true' : undefined}
						class="border-border flex w-full gap-3.5 border-t px-5 py-3 text-left {row.active ? 'bg-card' : ''}"
					>
						<span class="min-w-0 flex-1">
							<span class="block font-medium">{row.t}</span>
							<span class="text-shell-muted-foreground mt-0.5 block truncate text-xs">{row.s}</span>
						</span>
						<span class="text-shell-muted-foreground shrink-0 text-xs">{row.d}</span>
					</button>
				{/each}
			</ListShell>

			<div class="flex min-w-0 flex-1 flex-col gap-4 p-6">
				<div class="flex items-center gap-2.5">
					{#if !listOpen}
						<!-- The reopen control: entirely this page's own markup, driving
						     the same bound `listOpen` — ListShell renders nothing while
						     closed, by design. -->
						<button
							type="button"
							onclick={() => (listOpen = true)}
							aria-expanded={listOpen}
							class="border-border flex h-9 items-center gap-2 rounded-md border px-3 text-sm"
							data-probe="list-shell-reopen"
						>
							<PanelLeftOpen class="size-4" />
							Waiting on you <span class="text-muted-foreground">338</span>
						</button>
						<div class="text-muted-foreground ml-auto flex items-center gap-1.5 text-sm">
							<button type="button" aria-label="Previous" class="border-border grid size-9 place-items-center rounded-md border">
								<ChevronLeft class="size-4" />
							</button>
							<span>1 of 214 ready to file</span>
							<button type="button" aria-label="Next" class="border-border grid size-9 place-items-center rounded-md border">
								<ChevronRight class="size-4" />
							</button>
						</div>
					{/if}
				</div>
				<h1 class="font-display text-display font-semibold" data-probe="list-shell-page-title">
					Grocery Receipt
				</h1>
				<p class="text-muted-foreground text-sm">
					The module's own content, beside the list — {listOpen ? 'open' : 'folded'}.
				</p>
			</div>
		</div>
	</AppShell>
{:else if surface === 'settings'}
	<!--
		`padded={false}` is not incidental: the section list's rule and tint have to
		reach the content area's edges or the two panes read as a floating card, and
		SettingsShell pads its own content pane to the shell's own rhythm instead.
		The shell is what bounds the height the panes scroll inside, so the surface
		has to be driven through it rather than standalone.
	-->
	<AppShell
		nav={[{ label: 'Overview', href: '#/overview', icon: LayoutDashboard }]}
		currentPath={settingsPath}
		brandTitle="Harness"
		settingsHref="#/settings"
		padded={false}
	>
		<SettingsShell sections={settingsSections} currentPath={settingsPath}>
			<Panel
				title="Users"
				description="Who can sign in, what each of them may do, and which of them are notified when a bill needs approving. Removing someone here does not remove what they filed."
			>
				<p class="text-sm">Controls.</p>
				{#snippet footer()}
					<Button variant="ghost" size="sm">Cancel</Button>
					<Button size="sm">Save</Button>
				{/snippet}
			</Panel>
			<!-- Tall enough that the content pane has something to scroll. -->
			<Panel title="Notification rules">
				{#each LONG_LIST as option (option)}
					<p class="text-sm">{option}</p>
				{/each}
			</Panel>
			<Panel
				title="Delete this workspace"
				description="Every project, document and filing decision goes with it."
				tone="destructive"
				icon={Trash2}
			>
				<p class="text-sm">Gone for good.</p>
				{#snippet footer()}
					<Button variant="destructive" size="sm">Delete</Button>
				{/snippet}
			</Panel>
		</SettingsShell>
	</AppShell>
{:else}
	<AppShell
		{nav}
		{collapsible}
		{currentPath}
		bind:collapsed
		brandTitle="Harness"
		onSearch={() => (paletteOpen = true)}
		{searchPlacement}
	>
		{#snippet brandMark()}
			<span class="text-primary text-xs font-bold">H</span>
		{/snippet}
		{#snippet identity()}
			<button class="flex w-full items-center gap-2.5 px-3 py-3 text-sm" data-testid="identity">
				<span
					class="bg-primary/15 text-primary grid size-8 flex-none place-items-center rounded-full text-xs font-semibold"
					>OP</span
				>
				<span>Operator</span>
			</button>
		{/snippet}
		{#if withPageNav}
			<!-- An in-page nav: the OTHER surface AppNav is rendered on, the ordinary
			     page background, OUTSIDE the shell's chrome. It has to keep the PAGE's
			     ink at the same moment the rail follows `--ds-shell-chrome-foreground`
			     — one rule, two opposite answers, and the half that is easy to break
			     while the loud half still passes. So it is driven rather than argued.

			     Behind `?pagenav=1` because a second nav landmark changes the landmark
			     and tab-stop counts the hand-driven checks in `drive.md` pin. -->
			<AppNav {nav} {currentPath} label="Section" class="mb-6 w-56" />
		{/if}
		<h1 class="font-display text-display font-semibold">Page body</h1>
		<p class="text-muted-foreground mt-2 text-sm">
			Content the shell frames. Everything around it is the shared component.
		</p>
	</AppShell>

	<CommandPalette
		bind:open={paletteOpen}
		{nav}
		onNavigate={(href) => (location.hash = href.slice(1))}
	/>
{/if}
