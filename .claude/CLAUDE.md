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
- The REPO is private; the PACKAGES are public on npm. Those are separate
  settings and the split is deliberate: publishing to public npm rather than
  GitHub Packages means a consumer needs no token to install (GitHub Packages
  requires an authenticated request for every install, public packages
  included — broke onboarding twice). The repo went private on 2026-09-04;
  trusted publishing still works, but npm will not generate provenance
  attestations from a private repo, which is why both packages set
  `publishConfig.provenance: false`.
- CI runs on GitHub-hosted runners, not the self-hosted `atlas` runner every
  other repo defaults to. `publish.yaml` must stay there permanently — npm
  trusted publishing does not support self-hosted runners. `ci.yaml` and
  `security.yaml` only did so because the repo was public and can now move
  back to `atlas`; they have not yet, because the move needs a verified run.
  Reasons recorded in each workflow's own header.
- Release tags are **per-package**, not the household's global
  `v{YYYY}.{M}.{x}` scheme: `design-tokens-v<version>` publishes
  `@poodle64/design-tokens`, `ui-v<version>` publishes `@poodle64/ui`.
  `publish.yaml` resolves the package directory from the tag prefix and
  re-runs that package's own build/test before publishing — a tag in the
  household's ordinary global scheme triggers nothing here.
