# Elements

Status: **built, 17/10/2026, release 2026.10.43.** The operator ruled the same day (master-project#380) that a shared service's view reaches a product as a finished custom element the service builds and serves itself. Need: app-factory#43, from the library for eight, after casefile (`<casefile-matters>`) and the library (`<library-catalogue>`) each wrote the plumbing by hand.

## Decision

**The factory serves and places elements. An app writes only its elements, and a placing app one declaration.** The cost is about 410 lines in the factory: the runtime 130, the build 135, the backend routes 65, and wiring. casefile's copy is about 440 lines and the library's about 200; each deletes its copy when it converges.

```text
service                                                  placing app, any page
 src/elements/<tag>.svelte ──pnpm build──▶ /elements.js ◀── /elements/placed.js ◀── app.html
                                           /elements.d.ts ◀── pnpm generate:elements
 /api/…            ◀── api.GET, as the viewer (CORS_ORIGINS) ── <tag app="eight">, shadow root
 /elements/session ◀── one top-level hop when signed out ────── back to the same page
```

## Shape

- **One element, two placements.** Every page of every app loads `/elements/placed.js`, which imports the app's own `/elements.js` and each `ELEMENT_ORIGINS` app's. So the service's home page places `<library-catalogue>` unscoped, and eight places `<library-catalogue app="eight">`, from the same file.
- **Drawn from the kit.** `src/lib/elements/elements.css` compiles Tailwind over the app's elements and the `@poodle64/ui` components they import, with no palette. The build bundles the elements once without the stylesheet to learn which component directories they reach, and scans only those (`kitSources` in `vite.elements.config.ts`). Every element on a page adopts that one constructed sheet into its shadow root. The `--ds-*` tokens inherit from the host, so the element takes the page's palette, faces and density. Shadow DOM breaks three things the kit relies on, and the runtime restores each. `@property` rules are ignored inside a shadow root, so they are registered on the page. `.dark *` cannot reach in, so the page's mode is mirrored onto the host as `data-dark`, which the `dark:` variant reads. The kit's `:root` defaults match nothing in a shadow root, so a plain value (the control sizes) is registered on the page as an inherited property with that initial value, and one that reads another token (the shadcn aliases) is declared on the host (`reachHost`). A page that sets its own density still wins.
- **Overlays stay inside.** The kit's dialogue, popover, select and tooltip portal to `<body>` by default, outside the shadow root and the stylesheet. An element's markup sits in `<Overlays>` (from `$lib/elements`), which points bits-ui's `defaultPortalTo` at a layer inside the shadow root.
- **The display face is the page's.** `--ds-font-display` names `'Fraunces'` and `'Fraunces Variable'`, the family `@fontsource-variable/fraunces` registers. A shadow root registers no `@font-face`, so the placing page loads the face, as it does for its own pages. `@poodle64/design-tokens` before 2026.9.1 named only the bare `'Fraunces'`, which matches nothing, and the template's floor is now 2026.10.1.
- **Reads as the viewer.** `api` is openapi-fetch over the app's own schema, with credentials. A signed-out answer makes one top-level hop to `/elements/session`, which forward-auth walks. The service redirects back only to an origin in `CORS_ORIGINS`. Signed out again within a minute of a hop is final. It is not a hidden frame, because Authentik's sign-in pages refuse every frame (the library measured this on 16/10/2026).
- **Typed where it is placed.** `pnpm generate:elements` reads each origin's `/elements.d.ts`. That file is built from each element's `$props()` and its `customElement.props` types. An attribute is typed `string` unless the element declares otherwise, because a string is what arrives.
- **No CSP from the factory.** An app that sends its own CSP lists `settings.element_origins_list` in its `script-src` and `connect-src`.

## Adopting

A service:

1. Write `frontend/src/elements/<tag>.svelte`, starting with `<svelte:options customElement={{ tag: '<tag>', extend: element }} />`, and import `element` and `api` from `$lib/elements`. Use kit components and Tailwind as on any page.
2. Name every placing origin in `CORS_ORIGINS`.
3. At the front door, let `/elements.js` and `/elements.d.ts` pass without forward-auth (the yggdrasil vhost). Keep `/elements/session` and the API behind it.
4. Make its home page its own elements: `<tag></tag>`.

A placing app:

1. Set `ELEMENT_ORIGINS=https://<service>` in its per-host `.env`, and in `backend/.env` for dev.
2. Run `pnpm generate:elements` and commit `src/lib/elements/placed.d.ts`.
3. Put `<tag app="<this app>"></tag>` on a page.
4. If it sends its own CSP, add the element origins to it.

An existing app takes the factory's files with `copier update`. Its `frontend/package.json` is its own, so it takes the `build` and `generate:elements` scripts by hand.

## Proof

`tests/elements/proof.sh`, run by `factory-selftest.yaml`, stamps a service and a placing app in another palette, and drives both pages in Chromium in light and dark. The checks: the kit's button takes each page's primary; the card's ring, face and `dark:` variant follow the page; the attribute scopes the element; a declared Number arrives as a number; the display face loads; a pop-over opens inside the shadow root in the page's surface; the element reads its service's API cross-origin. One refused read makes one hop through the real `/elements/session` and back, and a second refusal is final. On a bare page with no Tailwind of its own, the `@property` registration draws the kit's borders and rings, the button is 2.5rem tall (and 2rem where the page sets that itself), and a pop-over keeps the kit's padding. The build fails on a CSS warning. The placing app type-checks against the derived types, and a wrong attribute type fails.

## Limits

- A placing page that does not load the display face draws it in the serif fallback. The element carries no fonts.
- In dev an element is served from `pnpm build`'s output. Nothing reloads it hot.
- A service that is down behind its front door looks signed out, and costs the placing page its one hop. casefile and the library behave the same way.
