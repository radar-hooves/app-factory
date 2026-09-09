# Changelog

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/); versioning is CalVer (`YYYY.M.x`).

## [2026.9.4] - 2026-09-09

### Fixed

- **`Composer` rendered its "All collections" scope chip even for a
  fixed-scope consumer.** A room with one shelf set never passes
  `documentName` or `collectionName`, which used to leave "All collections"
  as the sole entry in the chip row — console furniture with nothing to
  switch to. The chip row now renders only once there are two or more
  scopes to pick between; a fixed-scope consumer gets no chip and no space
  where it was. Covered by `src/lib/components/composer/composer.test.ts`,
  the package's first component test (also adds `src/test/setup.ts` and
  wires `vitest.config.ts`'s `setupFiles`, per `sveltekit-testing.md`).

## [2026.9.3] - 2026-09-09

### Fixed

- **A long citation title clipped at the edge on a phone.** The `Markdown`
  component's inline `code` span — how a citation's document title renders
  in running text — carried `white-space: nowrap` with no scroll wrapper, so
  a title longer than the container cut off at 390px with no way to read the
  rest, contained (no page scroll) but silently truncated. It now wraps at
  word boundaries (`white-space: normal; overflow-wrap: anywhere`), the same
  in-flow treatment as the prose around it; `@poodle64/ui`'s `.ds-prose`
  scroll-in-its-own-box pattern is reserved for wide block content (a table),
  not an inline identifier sitting inside a sentence. Verified at 390×844
  with a citation title long enough to force both a word wrap and, with no
  spaces at all, a mid-word break — no clipping, no horizontal scroll.
