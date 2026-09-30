# LiteLLM Proxy Admin UI — Top Rail Research

Subject: `ui/litellm-dashboard/` in `BerriAI/litellm` (GitHub, `main` branch) — the
open-source Next.js admin dashboard served by the LiteLLM proxy at `/ui`.

**UI kit**: Next.js 16 (App Router, static export — `output: "export"`), React 18,
TypeScript, Tailwind, **shadcn/ui** primitives (`@/components/ui/*` — Popover, Avatar,
Badge, Button, Switch, Separator, a custom `Sidebar` family) for shell chrome, **Ant
Design** for complex form inputs/tables, **Tremor** for usage/spend charts, TanStack
Query for server state, `lucide-react` for icons, `kbar` is NOT used here (that's
Grafana) — LiteLLM has no command-palette. This dictates a lot of the shell: shadcn's
`Sidebar` primitive is a collapsible flex rail with its own header/footer slots, which
is why the collapse toggle and the account menu both end up living in the sidebar
rather than the top bar (see Q2, Q3).

**A note on evidence generations.** Two distinct states are documented below, both from
real evidence: (a) **screenshot-verified** — five current-generation screenshots
(version badges v1.83.9 and v1.91.0, both carrying the "Agentic"/MCP Servers/Skills nav
items that only exist in the modern AI-Gateway rewrite) gathered by `reference-scout`
into `reference/`, all opened and confirmed genuine; (b) **main-branch source** — read
directly from `BerriAI/litellm@main` on 2026-09-04, which is visibly AHEAD of every
screenshot found (see Q2/Q3). No screenshot of the exact main-branch state below could
be located or captured live — flagged inline wherever the two disagree.

Seven 2024-vintage marketing/docs screenshots (old "LiteLLM" script logo, "Get
enterprise license" banner, flat un-grouped sidebar, no dark mode) were gathered then
deleted as superseded — a different, much older UI generation than the brief asked for.

---

## 1. What lives in the top bar itself

Two different top-bar shapes exist depending on mode, both confirmed in source
(`src/app/(dashboard)/layout.tsx`, `DashboardShell`):

**AI Gateway mode** (the flagship shell — Virtual Keys, Models, Usage, Teams, etc.) —
current main-branch source, `src/components/DashboardHeader.tsx`:

- Left: a `ViewSwitcher` (AI Gateway ↔ Agent Control Plane), a `BreadcrumbSeparator`,
  then the current page's title (from `getBreadcrumb(page)` in `leftnav.tsx` — title
  only, not the full section/title pair)
- Right: worker switch (self-hosted multi-worker setups only), `DocsLink`,
  `BlogDropdown`, `CommunityEngagementButtons` (hidden if disabled), a separator,
  `ThemeToggle`, `NotificationsBell`
- **No brand/logo, no search, no nav toggle, no user/profile menu** — the comment in
  source is explicit: _"Sits only over the content column (the brand lives in the
  sidebar header)"_
- Height `h-14` (56px), `border-b`, `bg-background`, `px-4`, and it is NOT a
  CSS-sticky element — see Q7.

**Screenshot-verified state** (v1.83.9 / v1.91.0, `reference/litellm-search-tools-tab.png`,
`litellm-model-detail-1280.png`, `litellm-create-team-key.png`) — a fuller top bar that
still carries the brand and account menu directly:

- Left: hamburger/nav-toggle icon, "LiteLLM" wordmark + logo, a dark/light toggle
  (moon icon), a version badge chip (`v1.83.9`)
- Right: Docs, Blog (chevron), two small icon buttons (Slack + a refresh-style icon —
  matches `CommunityEngagementButtons`), a notification bell (red-dot badge), an
  "Account" pill with a down-chevron
- No breadcrumb and no search box visible in this generation's top bar

The screenshots therefore show an **earlier point in the same modern (shadcn) rewrite** —
after the sidebar got its icon groups but before the header was slimmed to
breadcrumb-only and the brand/account menu were pushed into the sidebar. This is
documented as a real, source-grounded "before → now," parallel to the Grafana case in
Q3, but for LiteLLM the "before" is screenshot-evidenced and the "now" is
source-evidenced only (no screenshot of it was found).

**Agent Control Plane mode** (embeds an external agent-platform iframe, no sidebar) —
`src/components/navbar.tsx` — is the full-width bar that most closely matches the
screenshots above: logo + version badge (left), a `ViewSwitcher` after a divider, then
worker switch / `DocsLink` / `BlogDropdown` / `CommunityEngagementButtons` /
`ThemeToggle` + `NotificationsBell` + `UserDropdown` grouped in a pill on the right.
This is the one place the CURRENT source still puts brand + user menu + theme toggle
together in one top bar — it's just not the primary AI-Gateway shell.

## 2. Where user identity surfaces, and what clicking it reveals

**Current source (AI Gateway shell)**: NOT in the top bar at all. It lives in the
**sidebar footer** — `SidebarAccountMenu.tsx`, rendered from `leftnav.tsx`'s
`<SidebarFooter>`, below a `SidebarUsageCard`.

- Avatar: a 30px circular **initials avatar**, no photo/gravatar — two letters derived
  from the email local-part (or user ID), background colour hashed from the identity
  string (`hueFromString` → `hsl(hue, 46%, 38%)`) so each user gets a stable, distinct
  colour with no external image dependency.
- Collapsed sidebar: avatar only. Expanded: avatar + display name (truncated,
  `text-[13px]`) + role label beneath it (`text-[11px]`, muted) + a `ChevronsUpDown`
  affordance.
- Click → a **popover** (`side="top"`, width `268px`) containing:
  - Header row: "LiteLLM" wordmark + version badge (links to release notes)
  - Info rows with icon + label + value: **Tier** (Premium/Standard badge), **Role**,
    **Email** (monospace, copy button), **User ID** (monospace, copy button)
  - A block of feature toggles (Switch controls): "Hide New Feature Indicators",
    "Hide All Prompts", "Hide Blog Posts", "Hide Bouncing Icon" — client-side
    localStorage preferences, not identity-related but housed in the same menu
  - **Logout** button, full-width, at the bottom

**Screenshot-verified state** (`litellm-logout-menu.png`-equivalent for the older
2024 generation, since deleted, and the "Account" pill in the kept v1.83.9/v1.91.0
screenshots): a top-bar "Account"/initials pill with a chevron, opening a simpler
dropdown. The 2024-era version (deleted) showed just Role / ID / Premium User fields +
Logout — a strict subset of the current popover's content, confirming the info-rich
popover is a later addition even within the top-bar-account-menu era.

## 3. Where the nav-collapse toggle sits

This moved, and the move is source-confirmed the same way Grafana's did:

- **Screenshot-verified state**: a hamburger icon at the far left of the **top bar**,
  before the logo (`reference/litellm-search-tools-tab.png` et al.).
- **Current main-branch source**: the toggle is gone from the top bar (`DashboardHeader`
  carries no toggle at all — see Q1) and lives **on the sidebar's own head**:
  `leftnav.tsx`'s `<SidebarHeader>` renders a `Button` (ghost, icon-sm) with
  `PanelLeftOpen`/`PanelLeftClose` (lucide) next to the logo, `aria-label`
  "Expand/Collapse sidebar". There is also a secondary, incidental way to expand a
  collapsed rail: clicking the collapsed `SidebarUsageCard` in the footer calls
  `onExpandRail`.
- `src/components/navbar.tsx` (the Agent Control Plane top bar) still accepts an
  `onToggleSidebar` prop that would render a `PanelLeftClose/Open` button in the TOP
  bar — but it is never passed a value in current `layout.tsx` (that mode has no
  sidebar to collapse), so this is vestigial in the render path, not evidence of a
  current top-bar toggle.

Net: **top-bar hamburger → sidebar-rail-head toggle**, the same directional move as
Grafana's most recent change, evidenced by source rather than by a diffed screenshot
pair (no screenshot of the new state was found).

## 4. Breadcrumbs: in the top bar, and what that buys

Yes — in the current source, the top bar carries `ViewSwitcher | title` via `Breadcrumb`
/`BreadcrumbSeparator`/`BreadcrumbPage` (shadcn breadcrumb primitives). It is genuinely
minimal: **just the current page's title**, not a full trail (`getBreadcrumb(page)`
returns `{section, title}` but `DashboardHeader` renders only `title`) — the "section"
half is discarded at render time even though the data model carries it. This is
architecturally a long way from a full hierarchical breadcrumb; it functions more as a
persistent page-title label that survives scroll, paired with the gateway-mode switcher.

What it buys: the content area's own heading is freed to carry an actual page title

- description + primary action (see Q5) without needing to duplicate wayfinding — the
  top bar answers "what page/mode am I in," the page body answers "what am I looking at
  and what can I do here."

The older, screenshot-verified generation carries **no breadcrumb or title at all** in
the top bar — page identity there comes entirely from the sidebar's active-item
highlight plus the page body's own `<h1>`-style heading (e.g. "Search Tools", "Model
Management").

## 5. Page-level header beneath the rail

There is a real, separate page-level header — confirmed across every kept screenshot
and consistent with the shell not imposing one itself (`<main>` just renders
`{children}`, per-page components own their own heading block):

- Title as a bold heading (not literally `<h1>` styled — Tailwind large/bold text),
  often paired with a one-line description underneath (e.g. "Model Management" / "Add
  and manage models for the proxy"; "Search Tools" / "Configure and manage your search
  providers")
- Primary action button sits to the **right of the title row**, in the page body, not
  the top bar — e.g. "+ Add New Search Tool" (solid purple/indigo button,
  `litellm-search-tools-tab.png`), "Save Changes"/"Cancel" pair
  (`litellm-add-credential-1280.png`-equivalent), "Test Connection" / "Re-use
  Credentials" / "Delete Model" button row on the model detail page
  (`litellm-model-detail-1280.png`)
- Some pages add a second, sub-toolbar row below the title for view-mode
  controls — the Usage page's "Usage View" selector (Global/Organization/Team/Customer/
  Tag Usage dropdown) plus a time-range picker and "Ask AI"/"Export Data" buttons all
  sit in this second row, still inside the scrollable page body, not the sticky chrome
  (`litellm-usage-team-view.png`).

So: breadcrumb/title-label in the sticky top bar is deliberately thin; essentially all
page identity, description and actions live in a page-owned header block at the top of
the scrollable content — the opposite split from Grafana's `PageHeader` component
(shared, chrome-owned) — here every page hand-builds its own header markup.

## 6. Content width

No max-width constraint was found anywhere in the shell layer:

- `layout.tsx` (`DashboardShell`): `<main className="min-w-0 flex-1 overflow-y-auto">`
  — flex-fill, no `max-w-*` class.
- `DashboardHeader.tsx`: flex row, `px-4` only.
- `navbar.tsx` (Agent Control Plane top bar): `<div className="w-full">` wrapping the
  bar's flex row — explicitly full width.

This means the shell is **fluid by default**: the sidebar (a fixed pixel width, per
`MENU_WIDTH`-equivalent — collapsed/expanded, not measured here) is the only fixed
dimension; everything else stretches to fill whatever remains of the viewport. Screenshots
(all captured at 1280px) show tables and cards filling that width edge-to-edge inside
page padding, consistent with the source. **No screenshot at a genuinely wide desktop
viewport (1920px+) was obtained for LiteLLM** — whether individual page components
(e.g. a Tremor chart grid, a data table) impose their own `max-w-*` wrapper was not
exhaustively checked past the shell layer and the five kept screenshots; this is a real
gap, not an inferred "no." Given Tremor/shadcn dashboards commonly leave tables
genuinely fluid (more useful column width) while capping only text-heavy settings
forms, the reasonable expectation is "mostly fluid, individual settings pages may
cap" — but that is a prediction, not a verified finding.

## 7. Sticky behaviour

Architectural, not CSS-`sticky`. `DashboardShell`'s outer wrapper is
`h-screen overflow-hidden` — the viewport itself never scrolls. Sidebar and
`DashboardHeader` are flex siblings of `<main>`, which alone carries
`overflow-y-auto`. Because only `<main>` scrolls, the sidebar and top bar are pinned by
construction — they are simply outside the scrolling region, not fixed/sticky-positioned
inside it. (Contrast: the Agent Control Plane `Navbar.tsx` DOES use
`className="sticky top-0 z-chrome ..."` explicitly — that mode has no split
scroll-container, so it needs real CSS stickiness instead.)

Within the AI-Gateway page body, per-page sub-toolbars (e.g. Usage's view-selector row)
are NOT pinned — they scroll away with the rest of the content, per the DOM structure
in `layout.tsx` (only one `overflow-y-auto` boundary, at `<main>`, not inside individual
pages).

---

## Sources

- `BerriAI/litellm` GitHub, `main` branch, read 2026-09-04:
  `ui/litellm-dashboard/src/components/navbar.tsx`,
  `ui/litellm-dashboard/src/app/(dashboard)/layout.tsx`,
  `ui/litellm-dashboard/src/components/leftnav.tsx`,
  `ui/litellm-dashboard/src/components/DashboardHeader.tsx`,
  `ui/litellm-dashboard/src/components/SidebarAccountMenu/SidebarAccountMenu.tsx`
- DeepWiki `BerriAI/litellm` pages 3.7 (Admin Dashboard) and 3.7.1 (Dashboard
  Architecture and Components) — architecture/stack corroboration
- `docs.litellm.ai/docs/proxy/ui` — Quick Start (login flow, `UI_USERNAME`/
  `UI_PASSWORD`, `DISABLE_ADMIN_UI`)
- `reference/` screenshots (see `reference/manifest.md` for full provenance):
  `litellm-add-credential-1280.png`, `litellm-create-team-key.png`,
  `litellm-model-detail-1280.png`, `litellm-search-tools-tab.png`,
  `litellm-usage-team-view.png`
