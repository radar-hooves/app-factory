# Shared desktop layer

**APPROVED by the operator at 15:35 on 08/10/2026**, relayed by the master orchestrator with the second-read amendments below, including contributors building without his signing certificate. One imported layer, not another framework. Budget: **570 production lines, 300 tests and 120 CI lines**, added to existing owners. These are ceilings, not measured implementation sizes. Build the Thoth-facing slice first, then Bragi's; each app adopts in its own repo.

## The acceptance test

An external contributor can clone either app, resolve npm packages and ordinary crates publicly, fetch factory Rust kits from the public app-factory repository at a pinned factory tag, and build/run without the household broker, telemetry endpoint, signing certificate, atlas or a fleet checkout. The check uses an isolated home, no household environment and only the app's documented toolchain. It must launch the native app and observe its ready state, not merely compile mocks.

Household integrations default **off**. An unconfigured integration neither starts a helper nor contacts a household service. Optional settings enable it; environment overrides are shown read-only. No automatic certificate or credential creation. Certificate-free local macOS builds may be explicitly ad-hoc; release builds require the configured stable identity. A failed configured signature never falls back to ad-hoc.

This is a release gate for **each app**, not evidence supplied by a scratch factory stamp. The factory additionally checks its public package artefacts and its stamped desktop build. App adoption and the two clone-and-run proofs remain **OPEN** until their owning sessions run them.

## Reuse before adding

```text
App: brand, destinations, search queries/results, typed domain settings
  ├─ @poodle64/ui
  │    AppShell / AppNav / SettingsShell / Panel
  │    RecordList / ListToolbar / search and sort controls
  │    Toaster + About + optional integration/update presentation
  │    sidebar preferences + SvelteKit snapshot scroll restoration
  └─ factory Rust kits pinned to one public factory tag
       desktop-shell: traffic lights + guard_tray
       telemetry + Tauri telemetry plugin: optional native exporter
       official Tauri plugins: window state, updater/process where applicable

Skeleton: mount these APIs, declare defaults, pin compatible packages
          one Cargo signing runner + the existing desktop CI
```

The existing factory kits, `@poodle64/ui`, official Tauri plugins and SvelteKit snapshots are the machinery. Foreman, n8n and the MCP fleet are not native UI runtimes. No app adapters, copied shared components, second history stack, custom updater or new settings engine.

Live source checked on 08/10/2026: Thoth carries **127** lines of `traffic_lights.rs`, Bragi **125**. Both still call their local implementation rather than `desktop-shell`; neither uses its `guard_tray`. **Bragi already registers the official window-state plugin**, excluding visibility restoration; the second read's claim that neither app uses window state is not supported by current source. Keep Bragi's working registration; adopt the official plugin in Thoth where appropriate. Do not implement another window-state owner.

## Ownership

| Owner | Shared behaviour | App-owned input |
| --- | --- | --- |
| `desktop-shell` | Existing centred traffic lights and guarded tray setup | Window/header dimensions and domain tray actions |
| Official Tauri plugins | Window state; native update/install/relaunch where supported | Supported windows, endpoint/public key and installation mode |
| Factory signing runner | Actual Cargo artefacts, verify before execution, stable configured certificate/identifier; explicit certificate-free local mode | Certificate fingerprint and bundle identifier |
| Native telemetry kits | Exporter, probe and configured-versus-healthy status; no webview exporter | Service identity, emission allow-list and existing persistence |
| `@poodle64/ui` | About, toast layout/tokens, settings chrome, common optional-integration/update presentation | Brand/links, typed sections and actual native capabilities |
| Existing AppShell/AppNav | Hide/reorder optional destinations, collapse and restore defaults | Destinations, groups, badges and playlist/artwork contributions |
| Shared scroll support | Scroll capture/restore through SvelteKit's per-history-entry snapshots | Data-ready signal, stable item anchors and virtual-list positioning |
| Existing ListToolbar/RecordList | Search/sort controls and loading/error/empty/result presentation | Available sort choices, comparators, ranking, queries and result renderers |

Typed settings, constraints, current/default/reset values remain each app's Rust contract. No generic native settings service and no frontend copy of defaults. Preserve Thoth's already-landed `get_default_config` repair and Australian-spelling regression. Preference reset never erases recordings, credentials or OS grants.

Search is its own destination. Query/filter/sort state belongs in the URL; selection and scroll use SvelteKit snapshots. Query edits replace the current search entry rather than fill history per keystroke. Back from a result restores its results entry; Back again restores the previous view, selection and scroll. Never re-sort relevance by the preceding library sort. The shared layer does not decide what music or transcription search means.

## Settings and presentation

Use the shipped SettingsShell, Panel, controls, disclosure and status/error/loading states. Recording is Thoth's first essential section; Connections is Bragi's. A failure deep-link opens the relevant section. General contains appearance/startup and an initially closed Advanced disclosure for optional telemetry/integrations. Permissions shows only capabilities the app actually uses; Updates describes its actual installation method; About is one content composition usable in a dialogue or page.

Enable controls remain visible when off. Dependent fields sit beside their enable control. Environment-owned configuration is read-only and names its source. Configured is not healthy: missing helpers and failed exporter startup must be visible through the native plugin's status, not an endpoint-presence check. The obsolete `signet` helper is absent on huginn; the current fleet declaration uses `portcullis headers`. No saved app configuration was inspected or changed here.

History, import/transcribe, insights, model downloads, prompt/word-list editing, sync, cache/data deletion and shortcut reference are workflows or Help, not settings. A failed load exposes no editable guessed defaults. Failed saves leave persisted state unchanged and show an actionable error.

## Addition/deletion budget

| Addition to existing owners | Production | Tests | CI |
| --- | ---: | ---: | ---: |
| About, toast and optional integration/update presentation | 240 | 100 | 0 |
| Sidebar preferences and snapshot scroll restoration | 190 | 100 | 0 |
| Public Rust distribution, skeleton wiring and local signing mode | 140 | 100 | 40 |
| Credential-free native acceptance gate | 0 | 0 | 80 |
| **Maximum** | **570** | **300** | **120** |

No new generic Rust settings/capability contract. Search and sorting reuse the shipped components and app domain logic. If the budget is insufficient, report the measured gap before adding machinery.

Replacement scope, measured from source on 08/10/2026: shared mechanics only; domain code stays app-owned.

- **Both:** delete their local traffic-light modules (**252 lines combined**), then local shared chrome as each import lands. Mount `desktop_shell::traffic_lights::setup` and `guard_tray`; preserve actual tray actions. Do not duplicate Bragi's existing window-state plugin.
- **Thoth:** replace the **102-line** About dialogue; remove local bottom-centre/rich-colour Toaster configuration and dark Sonner overrides. Its **1,288-line** settings window mixes chrome and business behaviour: remove only shared framing/sections. Its **397-line** integrations section likewise retains local API/MCP logic. Replace the **153-line** updater store only when shared update behaviour is proven. **Keep all TCC compensation until a signed in-place update proves grant preservation**; local signing or matching requirements alone does not prove this.
- **Bragi:** replace its **129-line** fail-open runner and **248-line** About page. Replace the **102-line** settings sidebar and **67-line** scroll-memory mechanism. Its **402-line** sidebar, **158-line** navigation store, **68-line** search session and **171-line** sorter mix shared mechanics with music behaviour: remove only the shared parts. Replace its **162-line** telemetry form when the common section is published. Useful diagnostics/shortcuts move to Advanced/Help; notification-test furniture goes.

## Adoption and proof

1. **Thoth first:** adopt shipped native shell APIs, public package dependencies, optional integrations and explicit local signing mode; import shared About/toasts/settings. Run the clean external-contributor clone/build/run test. Prove load/save failures and native defaults. Keep TCC compensation.
2. **Bragi next:** adopt the same shell/presentation APIs, retaining its window-state configuration. On one real library slice, customise the sidebar, scroll, search, open a result and Back twice. Assert query/filter/sort/selection and item anchor restoration, including virtualised data; then use the same support for Thoth history. Run Bragi's clean clone/build/run test.
3. **Updates:** inspect every Bragi installation's actual executable/bundle path and owner before enabling in-place installation. The Mac fleet configuration examined by the orchestrator declares no Bragi Nix package; **that is not proof that no Nix-managed install exists**. Read-only `/nix/store` installs retain a truthful manual/managed-update mode. Reuse the official Tauri updater, existing signing material and installation-compatible artefacts; mint no key. Simulate failed download/signature and prove the old app still starts.
4. **Thoth grant proof:** install two different stably signed versions in place on one Mac and assert existing grants survive. Only then remove version-triggered TCC resets, stale-grant compensation and admin/reset/deploy prompts. Retain genuine permission status/requests. Self-signed signing is not notarisation or a cure for Keychain partition gates.

**Keep Rust distribution on public Git; eliminate crates.io publishing.** The master orchestrator's catalogue/declaration check found no crates.io credential on 08/10/2026. Public git dependencies require no household credential and avoid occupied names and another publishing pipeline. Keep `publish = false` and existing crate names; apps pin one factory release tag, for example `desktop-shell = { git = "https://github.com/radar-hooves/app-factory", tag = "<factory release>" }`. npm's existing OIDC workflow remains the UI publisher. The merging session owns factory tags/releases; this worktree supplies reviewed commits and exact package versions, with no package-specific tags.

Huginn's measured signing route and proof are in `desktop-skeleton.md`. No Thoth or Bragi file is changed by this factory lane.
