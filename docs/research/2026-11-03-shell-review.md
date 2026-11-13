# Shell review, 03/11/2026 (master-project#443, steps 1–2)

Screenshots: on huginn at `/private/tmp/shell-review/before/` (the lane's worktree copy went with its worktree), `<app>-<landing|list|detail>-<1440|390>.png`.
Taken headless through browser-driver-mac, engine `mine`: casefile, earworm, eight, library.
Not taken: caspo (own domain, no operator session), godswood and pebblestone (the 502s on
`*.godswood.au` burned the driver's bot-detection budget; the tool says stop, so I stopped).
Those three are read from `app-frame.svelte` and routes.
Casefile's landing is its Matters list (same pixels as the list shot).
Eight's run detail (`/runs/<id>`) shows "This page could not open — Internal Error": an app fault, not a shell one.

## What every measured app shares, and the gap to the ruling

All four render the same kit shell, so the gap is the kit's, not the apps':

| Ruling | Measured | Cause |
| --- | --- | --- |
| Rail right-to-left: account, day/night, alerts, report, small search | Search is a wide bar (about 24vw, centred-left) in casefile, earworm, library; a 300px box in eight; no alerts shown except library | kit `app-shell.svelte` `searchPlacement` (leading default); apps' `actions` snippet puts the bell |
| Breadcrumbs on the left | Plain "Matters" / "Runs" text, no trail; a detail page (casefile, library) still says only the section | kit `location` was `activeNavTitle` text |
| Sidebar toggle on the sidebar's top | "Collapse" row at the sidebar's foot, all four | kit rail foot |
| Settings in the user menu | already (`onAccountSettings`), admin settings are not | each `app-frame.svelte` `links` |
| Content without titles | casefile: big heading on list and detail; eight: caption above the table; library: back link + in-card title | the routes, not the frame |

## Per app (frame line = what differs in `frontend/src/lib/app-frame.svelte`)

- **casefile** (165 lines): rail is the kit's; search leading (default, no prop); route owns hero heading (matters list, detail).
- **earworm** (182): `accountCommands` snippet (l.152) adds palette actions; dashboard shows own segmented controls where the rail's middle belongs.
- **eight** (101): `searchPlacement="trailing"` (l.58); caption heading on runs list; run detail errors.
- **library** (95): the only app showing the alert bell (`AdminAlertBell`, l.69); in-page "‹ Library" back link where breadcrumbs belong.
- **godswood** (155): `searchPlacement="trailing"` (l.108); `accountCommands`.
- **pebblestone** (237): `searchPlacement="trailing"` (l.148); own `NotificationBell` and `BugReportWidget` in `actions` (l.174–190, the factory report button is the ruling's); dev-identity `<select>` in the bar; `pageType ?? 'tool'` default (l.150); image brand (`brand` snippet, l.153).
- **caspo** (474): the outlier. `themeToggle={false}` (l.280, 344) puts the toggle in the menu; a chip-in button in the bar (l.244); an "overlay sidebar" toggle in the bar (l.349); rail starts collapsed (RAIL_COLLAPSED_KEY); `home` branch (`/`) draws its own bar and no shell; `immersive` branch (`/records/id26`) draws no chrome; palette gains lessons and an Ask row.

## Caspo's main-content options → page types

| Caspo option | Page type |
| --- | --- |
| Prose pages (about, support, security, education topics) | `reading` |
| Settings, strategy, chat persona (a list column beside content) | `panel` + `PagePane` |
| Education, leave, gra, intelligence, library, id26 index, brand (full frame, scrolls inside) | `tool` |
| Overlay sidebar (working papers, ID26 records) | `tool` + a page control in the bar (`ShellControls`); no page type |
| Immersive `/records/id26` deck, workshop, check (no chrome) | **`bare`**, the one type added: nothing else can draw a page with no rail and no bar |
| Home `/` (full-bleed landing, own bar) | **Not decided here, see the question in the report.** Recommend `tool` under the standard rail |

## Needs that are not data (named, nothing bespoke built)

- caspo: palette extras (Ask row, lessons group), chip-in bar button, overlay-sidebar control, collapsed-by-default is data (`railCollapsed`).
- pebblestone: own bell and bug widget (their intake takes a title and screenshot the factory report cannot post; pebblestone#799), the dev-identity select.
- earworm/godswood: account palette commands.
