# Shared desktop layer

**Proposal — OPEN, 08/10/2026.** One factory-owned desktop layer, consumed through the existing Rust kits and `@poodle64/ui`; each app supplies its business behaviour and brand. Estimated addition: **920 production lines + 400 test lines**, not another framework or service. Only the fail-closed signing runner is built here. No app adopts the proposal before the operator approves it.

The master orchestrator requested signing and a settings proposal for Thoth and Bragi, then relayed the operator's wider request at 14:45 on 08/10/2026: updates, toasts, About, navigation, scroll, sort and search must be shared too. This document supersedes the narrower settings proposal. The existing factory shell, UI kits, native telemetry plugin and desktop CI are the rails; n8n/foreman are not runtime UI or native app services. No parallel desktop framework is needed.

## What the apps carry

Live source inspected on atlas on 08/10/2026; paths below are relative to the named repo. Both apps have active work, so this is a source snapshot, not a claim that their current working changes have been released. The two `docs/research/ux-audit-2026-10-08.md` audits supply the earlier installed-app signing measurements, not visual acceptance evidence.

| Concern | Thoth | Bragi | Divergence the factory removes |
| --- | --- | --- | --- |
| Updates | Native updater/process plugins (`src-tauri/src/lib.rs:246–257`); check/download/install/relaunch and retry toasts (`src/lib/stores/updater.svelte.ts:38–145`). Release targets hosted macOS/Ubuntu (`.github/workflows/release.yaml:25–43`). | No updater dependency in `src-tauri/Cargo.toml` or registration in `src-tauri/src/lib.rs`; release builds inside the flake (`.github/workflows/release.yaml:116–131`). | One update state/UX, with a truthful manual mode until a platform has installable, signed update artefacts. Build/artefact pipelines still need convergence; a common page alone is not an updater. |
| Signing | No `build.runner` (`src-tauri/tauri.conf.json:6–11`); installed app was ad-hoc in the audit; update-triggered TCC compensation (`src-tauri/src/config.rs:476–483`). | Runner configured (`src-tauri/tauri.conf.json:7`), but signing failure continues (`scripts/cargo-codesign.sh:78–83`); installed app was ad-hoc in the audit. | The built factory runner pins an existing certificate fingerprint, signs and verifies actual cargo artefacts, and refuses an unsigned build. |
| Toasts | Already imports shared Toaster, but sets bottom-centre/rich colours (`src/routes/+layout.svelte:43`); local Sonner dark-colour overrides (`src/app.css:109–144`). | Same shared Toaster with defaults, separately mounted for main/mini-player (`src/routes/+layout.svelte:211–244`). | One shared presentation contract. The operator reports Thoth's toasts cramped; source confirms configuration drift, not the measured cause of that cramped rendering. |
| About | A small centred dialogue with version and links (`src/lib/components/AboutDialog.svelte:15–101`, 102 lines). | Settings page with version, branding, build/cache information and copy action (`src/lib/components/settings/AboutPage.svelte:9–128`, 248 lines). | One About content composition; menu/dialogue and settings can mount it without duplicating content or diagnostic formatting. |
| Settings | Ten flat panes in `src/lib/windows/Settings.svelte:73–86`; local sidebar/frame at `:349–373, :1072–1138`; workflows mixed with configuration. | Local settings sidebar/view (`src/lib/components/settings/SettingsSidebar.svelte:27–35`, `SettingsView.svelte:14–54`); inline disclosure in playback. | Existing `SettingsShell`, common sections, app-owned domain sections and one disclosure pattern. |
| Sidebar | Fixed settings-window pane list and About footer, not a general configurable working sidebar (`src/lib/windows/Settings.svelte:73–84, 349–373`). | Fixed Library/Activity groups plus dynamic playlists, collapse and badge state (`src/lib/components/layout/Sidebar.svelte:31–82, 86–210`). | Extend the existing AppShell/AppNav, not copy Bragi's media sidebar. Preserve domain playlists/artwork as app contributions. |
| Scroll/Back | Settings pane owns overflow; history has its own fixed-row virtual scroller and keyboard scrolling (`src/lib/windows/Settings.svelte:1138`; `src/lib/components/HistoryList.svelte:44–124`). | View-keyed scroll memory (`src/lib/utils/scrollMemory.svelte.ts:14–61`); navigation snapshots section/selection/column browser, not search query (`src/lib/stores/navigation.svelte.ts:9–26, 68–82`). | One actual scroll owner per region; restore the visited entry, not merely the last offset for a broad view name. These Thoth files do not establish a general Back/scroll restoration contract. |
| Sort | History is newest-first SQL (`src-tauri/src/database/transcription.rs:468, 490`), with local filtering (`src/lib/components/HistoryPane.svelte:67–105`). | Domain-specific album/artist/track options and cached comparators (`src/lib/utils/sorting.ts:10–85`, 171 lines); search explicitly preserves relevance (`src/routes/+page.svelte:103–123`). | Common sort controls/state/tie-breaking mechanics; domain sort keys and music ordering remain business logic. |
| Search | Inline transcription/date filtering (`src/lib/components/HistoryPane.svelte:67–76`); native text search also orders newest-first (`src-tauri/src/database/transcription.rs:490`). | Latest-wins search session (`src/lib/utils/searchSession.svelte.ts:25–55`); result groups (`SearchResultsView.svelte:44–90`) replace library content (`LibraryContent.svelte:124–128`). Search query is outside navigation entries. | A real results destination. Today Bragi does not snapshot search as a navigation entry; existing per-view scroll memory alone cannot satisfy Back to the prior query and view. |

Thoth's defaults repair is already visible in live source: `FilterSettings.svelte:42–65` now loads `get_default_config` through the store instead of hard-coding filter defaults. Rust still enables Australian spelling (`config.rs:277`). The audit's mismatch is the regression case to preserve, not an outstanding bug to rebuild here.

## Ownership and the proposed shape

```text
App: brand + nav/setting declarations + domain queries, actions and renderers
  │
  ├─ @poodle64/ui
  │    AppShell / AppNav / ShellControls / SettingsShell (already shipped)
  │    Toaster / Panel / RecordList / ListToolbar / controls (already shipped)
  │    desktop composition: About, Updates, native settings sections (proposed)
  │    navigation entry + scroll restoration, results destination (proposed)
  │
  └─ factory Rust kits
       desktop-shell: native settings/permission/update mounting (proposed)
       tauri-plugin-telemetry: get / set / probe (already shipped)
       app native modules: recording, playback, library, domain storage

Skeleton: mount those exports, declare the app, pin releases
           cargo signing runner + one shared desktop CI/release shape
```

The drawing is an ownership hierarchy, not a new visual design. **No per-app adapters, copied components, emitter or toast service.** Extend each existing factory owner at its own API. A desktop-only UI entry point must keep Tauri imports out of browser consumers. Apps import it directly. Native registration composes the existing Tauri plugins, not a second updater or permission daemon. App-specific commands remain app-specific.

| Factory owner | Owns | App contributes |
| --- | --- | --- |
| `desktop-shell` and skeleton | Native capability/status commands, typed defaults/reset contract, registration of supported updater/process plugins; stable signing and build wiring | Required/optional capabilities, typed domain settings, update endpoint/public key and installation mode; secrets remain broker-vended |
| `tauri-plugin-telemetry` | Exporter configuration, probe and truthful startup/health status | Allow-list and service identity; no frontend exporter |
| `@poodle64/ui` shared primitives | Toast sizing/wrapping/actions and token colours; sort/search controls; all section/row/dialogue states | Message title/detail/action and domain labels; continue calling `toast.*` directly |
| Desktop compositions in `@poodle64/ui` | One About, Updates and native telemetry/permission presentation; settings assembly | Brand, links/licence and declared domain sections; no alternate chrome |
| Existing AppShell/AppNav, extended | Customisable sidebar: hide/reorder optional items, collapse, restore defaults; one persisted preference shape keyed by stable route IDs | Nav groups/items, badges and domain content; required Settings/Help remain reachable; native settings owns preference persistence |
| Shared view-state support | Back/Forward through SvelteKit/browser history; entry-keyed filter/sort/selection and scroll snapshot; dedicated search destination with loading/error/empty/results states | Route identity, item IDs, data-ready signal and domain result renderers/query |

Keep one content scroll owner, and explicitly register any independent sidebar/list owner. Save an entry's item anchor plus offset; restore after the matching data and DOM are ready, including virtual lists, rather than after a guessed timer. State keys include history entry, route and query. Back from a result returns to the results entry; Back again restores the previous library/filter/sort/selection and scroll. Query changes replace the current search entry rather than fill history on every keystroke. The app's search API supplies results/ranking; the factory owns latest-wins cancellation and navigation, not a music or transcription search engine.

`ListToolbar`/`RecordList` already cover much of the presentation. Share sort state, available-key validation, stable item-ID tie-breaking and generic collation once; leave Bragi's artist/album rules and Thoth's native query semantics in domain code. Never silently re-sort relevance results by the preceding library sort. Do not add another list framework, database or history stack alongside SvelteKit.

## Settings: what appears first

The first section is the app's essential configuration: **Recording** in Thoth, **Connections** in Bragi. A failure deep-link opens the relevant section instead. Group by scope; neither app currently needs workspace settings.

```text
SettingsShell section list        Selected section
This app                         Essential controls first
  Recording / Connections        Dependent fields beside their enable control
  [other domain sections]
This device                      General
  General                          Appearance and startup
  Permissions                      ▸ Advanced (closed initially)
  Updates                            Telemetry / integrations / diagnostics
  About
```

Use the shipped `SettingsShell` from `@poodle64/ui/settings-shell`, `NavSource`, `Panel`, controls, `Collapsible`, `StatusBadge`, `AlertDialog` and loading/error states. Use household design tokens for spacing, type, surfaces and status; apps supply their palette, not an alternative density system. No repeated Settings heading, bespoke sidebar or overview dashboard.

**Advanced is a disclosure inside General, not another flat nav category.** Expert domain fields use the same inline disclosure in their own section. Deep links expand it and focus the target. Keep feature enable controls visible even when off; never hide the only way to enable something.

| Common section | First view | Disclosed/conditional | Excluded |
| --- | --- | --- | --- |
| General | System theme, relevant startup/window behaviour; one copy each | Advanced: telemetry, local API/MCP, diagnostic detail | Setup checklist, notification-test row |
| Permissions | Live OS status, reason and link to the correct OS settings | Only capabilities the app uses; optional grant requested when its feature is enabled | Per-update resets, raw `tccutil`, pretend grant switches |
| Updates | Installed version, actual update method; check/install when supported | Channel only if multiple exist; restart when needed | A disabled page implying Bragi already self-updates |
| Telemetry, inside General → Advanced | Effective endpoint, separate configured and healthy/failed status, credential-source reference, collector probe | Environment-controlled values read-only, with their source; failure detail | Secret reveal, log viewer, browser exporter |
| About | Brand/version, help/licence links and link to Updates | Non-sensitive build/diagnostic detail and copy action | Decorative device ID, duplicated configuration |

Bragi's lane reported a missing telemetry authorisation helper on huginn while a saved endpoint made the app look configured. That report is **not independently verified here**. It strengthens the need for native startup failure to be exposed separately from configuration presence; no plugin fix is claimed in this change.

Thoth's domain sections: Recording; Output (filters and vocabulary-bias toggle); Enhancement (enable/backend/model/prompt selection); Storage (retention/resource policy). Disclose hands-free silence duration, enabled indicator style, provider-dependent fields and model idle-unload. Bragi's: Connections; Playback; Library policy; AI playlists with its enable control visible. Disclose crossfade duration, lossy bitrate and AI budget/prompt override. Existing defaults, including ReplayGain, do not change with this proposal.

**Workflows never belong here:** history, import/transcribe, insights, model catalogue/download, word-list or prompt editing, sync now, cache/data deletion. Put these in working navigation or storage/library management; put the shortcut reference in Help. Selection/policy stays in settings; doing the work does not. Destructive actions need named confirmation and completion feedback; failed actions show an error and leave persisted state unchanged. A failed load must not expose editable guessed defaults.

## Rust owns defaults

The app's typed Rust settings definition owns defaults, constraints and validation. Its native command supplies current/default values; a section-scoped reset persists those same defaults and returns the effective result. Generate IPC types; do not retype a defaults object in Svelte or seed another store copy. Reuse Thoth's existing defaults command as the native precedent. `SchemaForm` can render ordinary declarations; device/connection controls need their specialised compositions, not another form engine.

Assert fresh config = defaults command = reset result. Preserve the Australian-spelling regression test. Preference reset does not erase recordings, credentials or OS grants. Defaults are unavailable until loaded, not guessed.

## Addition and deletion budget

Estimates below are **design budgets, not measured implementation sizes**; no shared desktop implementation has been built. Stop and reshape if they are exceeded rather than fill the budget with abstractions.

| Addition to existing owners | Production lines | Tests |
| --- | ---: | ---: |
| Native settings/capability contract and plugin mounting | 140 | 80 |
| About, update state/presentation and native settings sections | 260 | 100 |
| Shared toast defaults/wrapping and sidebar preferences | 110 | 50 |
| Entry/scroll restoration and results-destination lifecycle | 240 | 100 |
| Sort-state support and skeleton mount/release wiring | 170 | 70 |
| **Total proposed addition** | **920** | **400** |

The signing implementation is separate: **316 added lines, 1 removed** in its commit, including tests and the initial proposal, not 316 lines of runtime. The runner itself is 70 lines. Source file counts below were measured with `wc -l` on 08/10/2026; they are review envelopes, not promised net deletion.

- **Thoth:** replace the 153-line updater store and 102-line About dialogue (**255 whole-file lines**) with kit imports. Remove the local bottom-centre/rich-colour Toaster options and Sonner dark-colour CSS overrides when the shared toast contract lands. Its 1,288-line settings window mixes shell and business behaviour: remove only its pane-list/frame and common sections, not all 1,288 lines. Integrations is 397 lines and mixes API/MCP with telemetry; extract common telemetry only. After a signed-update grant-preservation test, delete version-triggered TCC reset, `reset_permissions_after_update`, stale-grant compensation, admin/reset prompts, raw reset commands and deploy-time reset. Preserve genuine permission status/requests and domain work. Its defaults repair is already present; do not replace it with another frontend copy.
- **Bragi:** replace its 129-line fail-open signing runner and the 248-line About page (**377 whole-file lines**). The 402-line sidebar includes domain playlist/artwork content: remove its navigation chrome, retaining those contributions. Replace the 102-line settings sidebar; replace the 67-line scroll-memory mechanism and generic portions of the 158-line navigation store/68-line search session. Retain music selection/ranking, renderers and the domain parts of the 171-line sorter. Replace the 162-line telemetry form when the shared section lands. Remove Developer nav, notification-test row and settings shortcut reference; move useful diagnostics/Help content rather than discard it.
- **Both:** delete local copies of common presentation and behaviours as their imports land, one concern at a time. No app-level compatibility shim or permanent parallel implementation. Factory code must not learn a Thoth or Bragi special case.

## Order of adoption and proof

1. **Signing, then permission compensation removal.** Adopt the factory runner and matching bundle identity in each app-owned config/flake. Keep certificate fingerprint and bundle identifier stable. The runner refuses missing/invalid identity, signing and verification failure and executes the verified dev binary without a second cargo invocation. Builds never create certificates. Linux/macOS are the skeleton's current build hosts; no Windows runner is supplied. Install two different signed versions on the same Mac and assert existing grants survive before deleting compensation. Local signing is not notarisation, cross-Mac grant transfer or a cure for Keychain partition prompts.
2. **Shared primitives, About and settings/defaults.** Fix toast wrapping in the shared primitive against native-resolution main/mini-player screenshots; mount one About and the common settings sections; preserve Thoth's native-default regression. Verify load/save failures and irreversible confirmations, not just component rendering.
3. **Sidebar, navigation/search and sort.** Use one Bragi slice first: customise nav, scroll a real library, search, open a result, Back twice. Assert route/query/sort/selection and item anchor restored, including virtualised data, then adopt Thoth's history slice. No bulk app migration before that drive test.
4. **In-place updates.** Converge on the household's existing build hosts and one reusable release shape; declare platform artefacts/install modes, then enable check/download/verified install/restart. Tauri's updater artefact signature is distinct from macOS code signing. Use an existing broker-held updater key; absence is a credential-owner decision, never a key minted by the app or this lane. Linux AppImage versus Nix-managed installation must be settled and proven; keep truthful manual mode until then. Simulate failed download/signature and prove the old version still starts.

Each proven concern lands in the factory and then each app deletes its duplicate. The merging session owns releases/tags; this worktree only commits and pushes its branch. App-owned configs/flakes require explicit adoption, not an assumption that copier overwrites them.

## Verdict

**There is juice left: stable signing, one imported desktop layer, correct defaults, and navigation that returns you to where you were. Those remove duplicated machinery and daily friction. Do not build another desktop framework or endlessly redraw settings: after those concrete wins, spend the effort on recording, playback and the apps' useful work. That is where squeezing the chrome becomes flogging a dead horse.**
