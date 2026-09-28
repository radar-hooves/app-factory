# Design System

The household web design-language factory: a pnpm workspace publishing
`@poodle64/design-tokens` and `@poodle64/ui`, the two packages every
SvelteKit app consumes to converge on one look — personality differs by
palette only (`master-project#174`, WP-51).

## Scope

- An app's personality is exactly two sanctioned knobs: the **accent**
  (`--ds-color-primary` and its pair) and a **palette** from
  `packages/design-tokens/tokens/palettes.json` — a hue plus a chroma scale
  projected through the shared neutral ladder. A palette carries no field
  for a lightness or a status colour; the ladder's own steps carry every
  contrast guarantee. Widening this surface is a governance change argued
  in writing (`docs/development/decision-palette-catalogue-and-the-tone-axis.md`
  is the precedent) — an app never hand-writes a value for a named
  semantic token, and this repo never grants a per-app exception.
- Non-negotiable design constraints (corner radius, fonts, OKLCH colour
  space, the `--ds-*` namespace) are recorded once, in
  `packages/design-tokens/README.md` — do not restate them here.

## Pitfalls

- `pnpm --filter @poodle64/ui run <script>` builds/tests only that
  package's own directory — its tests compile against
  `@poodle64/design-tokens`' emitted stylesheets, so a scoped run against
  an unbuilt `design-tokens` finds nothing. Use
  `pnpm --filter '{./packages/ui}...' run <script>` (includes workspace
  deps in dependency order), or the root `pnpm build`/`pnpm test`, which
  already builds the whole workspace via `pnpm -r`.
- No lint tooling is wired into CI or pre-commit anywhere in this repo (no
  ESLint). `.prettierrc` exists only to RECORD the house style (tabs,
  printWidth 100, single quotes) — nothing runs it; it exists because a
  prettier invoked without it walks up to the master-project root's
  2-space config and reindents whole files.
- The repo and the packages are public. Packages publish to public npm, not
  GitHub Packages, so a consumer needs no token to install (GitHub Packages
  requires an authenticated request for every install, public packages
  included — broke onboarding twice). The packages set
  `publishConfig.provenance: false`; npm would now generate provenance, and
  switching it on waits for a publish that proves it.
- `publish.yaml` runs on a GitHub-hosted runner permanently: npm trusted
  publishing does not support self-hosted runners. `ci.yaml` and
  `security.yaml` run on `atlas`, except a fork's pull request, which runs
  on a GitHub-hosted runner so outside code never reaches `atlas`.
- Release tags are **per-package**, not the household's global
  `v{YYYY}.{M}.{x}` scheme: `design-tokens-v<version>` publishes
  `@poodle64/design-tokens`, `ui-v<version>` publishes `@poodle64/ui`.
  `publish.yaml` resolves the package directory from the tag prefix and
  re-runs that package's own build/test before publishing — a tag in the
  household's ordinary global scheme triggers nothing here.
