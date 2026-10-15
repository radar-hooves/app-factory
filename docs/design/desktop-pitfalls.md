# Desktop pitfalls

Each is one cause and one fix, from a desktop app that met it. The skeleton and kits carry the fix where code can.

## Build and tooling

- **Tauri versions move together.** `tauri build` refuses an `@tauri-apps/api` whose minor differs from `@tauri-apps/cli` or the `tauri` crate. Renovate groups the three (`skeletons/desktop/renovate.json`); a hand bump moves all three.
- **`stylelint --fix` only on `*.css`.** On a `.svelte` file it appends a bare property after the terminated declaration of an inline `style="…{x}"`, and the next check reads clean. The web template's `lint:css:fix` script and pre-commit hook fix CSS only; the desktop skeleton has no fix script.
- **A workflow with an orphaned empty `env:` key** is rejected whole before any job starts: no logs, no check-run. `actionlint` in pre-commit reads it as a syntax error.
- **Icons are 8-bit RGBA.** A 16-bit PNG crashes at launch with "dimensions don't match the number of pixels".
- **A `.deb` `Depends` lists the libraries the app `dlopen`s,** such as the tray's appindicator: they have no `DT_NEEDED` entry for the bundler to infer. The skeleton's `tauri.conf.json` carries `libayatana-appindicator3-1 | libappindicator3-1`.

## Rust

- **Never hold a state `RwLock` or `Mutex` guard across a network `.await`.** A slow server hung the app at nine sites. Copy what is needed out, drop the guard, then await. Dropping the guard removes accidental serialisation, so a stale-result guard (a request counter checked before storing) may be needed.
- **Never enable reqwest's `hickory-dns` feature.** Its in-process resolver never recovers after macOS sleep or a VPN DNS change ("dns error: no connections available"). The factory's crates build reqwest without it and use the OS resolver.
- **The macOS Keychain is unusable for a build without an Apple-issued certificate,** and every rebuild re-prompts. Fall back to a file credential store.
- **macOS traffic lights are AppKit's to place.** AppKit re-lays out the title bar every frame of a live resize, so moving the buttons on `Resized` makes them jump to the top and snap back on mouse-up. `desktop_shell::traffic_lights::setup` gives the window an empty unified `NSToolbar`, which makes the title bar 52 points tall and centres the buttons in it (x 19-73, 26 down, measured under the 14.4 SDK). The app's header is 52 points. Native fullscreen drops the toolbar and the exit gives it back.

## Linux

- **Native Wayland takes the taskbar icon from a `.desktop` file matching the app id,** not from the window icon. Ship the `.desktop` file.
- **WebKitGTK on NVIDIA under Wayland** fails with "Error 71 (Protocol error) dispatching to Wayland display". Set `WEBKIT_DISABLE_DMABUF_RENDERER=1` and use the x11 backend; remove both when WebKitGTK fixes it.
- **WebKitGTK jank** comes from box-shadow transitions, `backdrop-filter` and heavy `will-change`. Drop them from hover and scroll paths; give grid cards `content-visibility: auto` with `contain-intrinsic-size`, and contain regions with CSS `contain`.

## Svelte 5

- **A plain `Set` or `Map` inside `$state` is not reactive.** Use `SvelteSet` and `SvelteMap`.
- **Reading a large reactive array inside an effect without `untrack()`** tracks every element: O(n²) work and 13-20 s freezes. `untrack()` what the effect does not depend on.

## Testing

- **WKWebView has no external WebDriver,** so raw `tauri-driver` end-to-end runs on Linux and Windows only. macOS layout is checked by the harness below, and the native window by looking at it.

### Headless WebKit layout harness

`skeletons/desktop/scripts/webkit-layout/` runs the front end under Playwright's WebKit, with the Tauri runtime mocked, and reports what a page script measures. `tauri-mock.js` supplies `__TAURI_INTERNALS__` (`metadata`, `invoke`, a `transformCallback` that stores callbacks) and `__TAURI_EVENT_PLUGIN_INTERNALS__`; it records the handler ids a page registers through `plugin:event|listen`, so `--emit "event={json}"` fires an event at them, and `--invoke "command={json}"` answers a command.

```console
$ pnpm dev &
$ nix shell --impure --expr 'with import (builtins.getFlake "nixpkgs") {}; python3.withPackages (p: [p.playwright])' \
    --command env PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
    python scripts/webkit-layout/run.py http://localhost:5173 --shot /tmp/home.png --eval check.js
```

`check.js` is one expression returning JSON; `{ok: false}` or `false` exits 1. Rule: reproduce a known failure before trusting a pass. Break the layout on purpose and see the harness say so. It refuses a URL that answers non-2xx, so a wrong server on the port cannot pass.
