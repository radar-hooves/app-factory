# Desktop settings shell

**Proposal — OPEN, 08/10/2026.** Reuse `@poodle64/ui`'s settings shell, shrink each app's list, and keep specialist controls behind disclosure. Cost: one shared desktop composition and native settings contract, then one adoption pass per app; no new service, framework or settings database. Only the signing runner is built in this change. The operator's approval of the shell is still required.

Requested by the master orchestrator for Thoth and Bragi. Evidence: their source-based UX audits of 08/10/2026 (`docs/research/ux-audit-2026-10-08.md` in each app); installed macOS apps were measured ad-hoc signed. The audits are not visual acceptance tests. Existing shapes considered: the factory's `SettingsShell`, `SchemaForm`, web settings slice and native telemetry plugin. The shell and controls fit; the web slice's HTTP/admin/database contract does not fit a local Tauri app.

## One destination, two panes

The first section is the app's essential configuration, not an overview dashboard: **Recording** in Thoth; **Connections** in Bragi. An explicit deep link (permission failure, expired connection) opens its named section instead. Groups describe scope; neither app currently needs a workspace group.

```text
SettingsShell section list        Selected section — existing UI controls
──────────────────────────       ──────────────────────────────────────
This app                         App-specific settings; dependent fields
  [app's essential section] ←    appear beside the control that enables them
  [other app sections]
This device                      General
  General                          Appearance and startup
  Permissions                      ▸ Advanced (closed initially)
  Updates                            Telemetry
  About                              Local integrations
                                     Diagnostics
```

The drawing is a content hierarchy, not a new visual design. Compose `SettingsShell` from `@poodle64/ui/settings-shell` inside `AppShell` with its existing unpadded settings destination; sections use its `NavSource`, not a second bespoke sidebar. Use the shipped `Panel`, form controls, `Collapsible`, `StatusBadge`, `AlertDialog`, loading/error states and Sonner feedback. Use `@poodle64/design-tokens` spacing, type, surface and status tokens; the app supplies its palette, not a competing density or component vocabulary. No repeated “Settings” title or dashboard cards.

**Advanced is a disclosure inside General, not another flat navigation category.** App-specific expert fields use the same inline disclosure in their own section. A deep link to an advanced field expands its disclosure; keyboard focus moves to the destination. Keep feature enable controls visible even when off — do not hide the only way to enable something. Theme, startup, device, shortcut and core playback/recording controls are never labelled advanced.

## Common sections and disclosure

| Section | First view | Disclosed or conditional | Never here |
| --- | --- | --- | --- |
| General | System theme, relevant startup/window behaviour; one copy of each control | Advanced: telemetry, local API/MCP, diagnostic detail | First-run checklist, setup dashboard, notification-test button |
| Permissions | Live OS status, why each capability is needed, one action opening the correct OS settings | Only capabilities this app uses; request optional grants when the feature is enabled | Per-update resets, raw `tccutil`, a pretend “grant” switch |
| Updates | Installed version and actual update method; check/install only if the app supports it | Channel only when multiple channels exist; restart when an installed update needs it | A disabled updater UI implying Bragi has an updater |
| Telemetry, inside General → Advanced | Effective endpoint, separate configured and healthy/failed status, credential-source reference, collector probe | Environment-controlled values read-only with source shown; detail on failure | Credential values/reveal, in-app log viewer, generic “analytics consent” replacing the native telemetry contract |
| About | App/version, help/licence links; a link to Updates | Diagnostic paths and copyable non-sensitive build detail | Device ID as decoration, a second settings inventory |

Save failures are visible and leave the persisted value unchanged; show load failure rather than editable invented defaults. Destructive maintenance uses a named confirmation and completion feedback, never an icon that silently purges. Maintenance belongs with the library/storage workflow, not in a universal settings footer.

## App-specific slots

| App | First | Other app sections | Inline disclosure |
| --- | --- | --- | --- |
| Thoth | Recording: device, shortcut, mode, sound and indicator | Output: filtering and vocabulary-bias toggle; Enhancement: enable/backend/model/prompt selection; Storage: retention and resource limits | Silence duration only for hands-free; indicator style only when enabled; provider-specific connection fields; model idle-unload and API/MCP detail |
| Bragi | Connections: library backends and scrobble connection | Playback: gapless/crossfade/ReplayGain/EQ/scrobbling; Library: sync schedule and cache policy; AI playlists: visible enable control | Crossfade duration only when enabled; bitrate only for lossy downloads; AI connection fields on enable, budget/prompt override behind Advanced; telemetry leaves Connections |

Connection setup must name both supported library backends. A model picker must explain its dependency on connection discovery rather than sitting disabled without a reason. Existing defaults, including ReplayGain, are not changed by a layout proposal.

**Not settings:** history, transcription import, insights/statistics, model download/catalogue, vocabulary editing, prompt editing, “sync now”, cache/data deletion and the shortcuts reference. Put these in the app's working navigation, storage/library management, or Help. Selection and policy remain settings; doing the work does not. No new universal panes for features one app alone has.

## Defaults come from Rust

Each app's typed Rust settings definition owns defaults, constraints and validation. A native settings command returns current values and defaults from that definition; a section-scoped reset invokes Rust, persists that same default and returns the effective result. Generate IPC types from the native contract; do not retype a defaults object in Svelte or initialise a store with another copy. `SchemaForm` can render ordinary declared fields; specialised device/connection controls remain shared compositions, not a new form engine.

Adoption must assert that a fresh config, the defaults command and a reset yield the same serialised values. The Thoth audit found Australian spelling **on** in Rust but **off** in its frontend reset: that regression becomes the test case. Resetting preferences must not erase recordings, credentials or OS permission grants. Frontend defaults are unavailable until loaded, not guessed.

## Signing boundary

The skeleton pins one existing certificate's SHA-1 fingerprint in `bundle.macOS.signingIdentity`; its runner and Tauri bundle signer share that value and the stable bundle identifier. A display name is refused because another certificate could reuse it. The runner obtains actual executable paths from cargo, signs and verifies them, and executes the verified dev binary without a second cargo invocation. Missing/invalid identity, signing and verification failures stop the build. No certificate is created and no ad-hoc fallback is shipped.

This stabilises local code identity; it is not notarisation, a cross-Mac privacy-grant transfer, or a cure for Keychain partition prompts. The rule already requires file credentials without an Apple-issued identity. Keep first-install permission guidance and real denied-permission recovery. Delete update compensation only after **two different signed app versions installed on the same Mac preserve the existing grants**. A skeleton signature check alone cannot prove that outcome for either app.

## What adoption deletes

- **Thoth:** after the signed-update drive test, version-triggered TCC reset, `reset_permissions_after_update`, admin/reset prompts, stale-grant compensation probes, raw reset commands and the deploy-time TCC reset. Keep authoritative live permission status and an OS-settings link. Remove duplicate Overview controls/checklists, workflow panes from settings, frontend/store default copies, and local settings sidebar/frame once the shared shell owns them. Keep genuine recording permission requests.
- **Bragi:** replace its fail-open/path-guessed codesign runner with the factory-owned runner; remove the Developer navigation item, notification-test row, shortcuts reference, telemetry's separate Connections form, and local sidebar/frame. Preserve useful diagnostics behind disclosure and Help's shortcut reference. Remove any frontend default copies found during adoption; the audit did not establish a defaults mismatch here.
- **Both:** delete duplicated telemetry presentation when the shared native section lands; retain the existing plugin API (`get`/`set`/`probe`) rather than build another emitter. No reset/grant code is deleted solely because this proposal exists. Their app-owned Tauri configs and flakes need explicit adoption; copier does not overwrite them. Release/tag and adoption belong to the merging session, not this worktree.

## Verdict

**There is juice left: stable signing first, a smaller shared settings shell and Rust-owned defaults next, then visible failures and destructive-action confirmations. These are concrete factory-level savings, not another redesign. Beyond that, stop squeezing the shell and build the apps' useful workflows — another round of settings chrome would be flogging a dead horse.**
