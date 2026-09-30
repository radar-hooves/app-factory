# kits/typescript

Shared TypeScript app code: the household web design language and the components every SvelteKit app builds from, published to public npm and consumed as ordinary dependencies, never copied into an app. Same rule as [`kits/rust`](../rust/README.md) and [`kits/python`](../python/README.md). It is its own pnpm workspace with its own lock, and every command below runs from this directory. Personality differs by palette only (per-app `DESIGN.md`); everything else comes from here.

## Packages

```text
packages/
  design-tokens/    @poodle64/design-tokens — DTCG token source, Style Dictionary
                     build, --ds-* CSS custom properties, Tailwind v4 @theme block,
                     and the 20-palette catalogue an app picks its personality from.
  ui/                @poodle64/ui — the shared component layer: shadcn-svelte
                     primitives (bits-ui) plus the composed page chrome (page
                     header, panels, states, stat cards, dialogue frame, data
                     table), restyled by whichever app's token alias layer is
                     active.
  librarian/         @poodle64/librarian, an agent's conversation surface: the
                     stream client, transcript state and chat components, so any
                     household app renders a console instead of rebuilding one.
                     It carries its own CSS, so it needs no Tailwind scan line.
  console/           private: the shell lab, the palette catalogue and the
                     component gallery (`pnpm dev`, port 9176).
```

All three published packages are public on npm under the `@poodle64` scope: no registry config and no token to install. [`DESIGN.md`](DESIGN.md) is the household design language. Background: `docs/master/templates/golden-patterns/app-shape-and-frontend.md` in radar-hooves/master-project (`master-project#174`).

## Scope

- An app's personality is exactly two sanctioned knobs: the **accent** (`--ds-color-primary` and its pair) and a **palette** from `packages/design-tokens/tokens/palettes.json`, a hue plus a chroma scale projected through the shared neutral ladder. A palette carries no field for a lightness or a status colour; the ladder's own steps carry every contrast guarantee. Widening this surface is a governance change argued in writing ([`docs/development/decision-palette-catalogue-and-the-tone-axis.md`](docs/development/decision-palette-catalogue-and-the-tone-axis.md) is the precedent); an app never hand-writes a value for a named semantic token, and no app gets an exception.
- The non-negotiable design constraints (corner radius, fonts, OKLCH colour space, the `--ds-*` namespace) are recorded once, in [`packages/design-tokens/README.md`](packages/design-tokens/README.md).

## Documentation

| Document | Scope |
| --- | --- |
| `packages/design-tokens/README.md` | Token source, binding constraints, the palette catalogue, consumption |
| `packages/ui/README.md` | The component layer and its consumption snippet |
| `packages/ui/harness/drive.md` | What is verified in a real browser, and what each gate caught |
| `packages/librarian/README.md` | The conversation surface and its consumption |
| `docs/development/` | Decision records for changes that move a constraint rather than apply one |

## Building and testing

```bash
pnpm install
pnpm build                                     # every package, in dependency order
pnpm test                                      # builds, then tests every package
pnpm --filter '{./packages/ui}...' run <script>   # one package AND its workspace deps
```

`pnpm --filter @poodle64/ui run <script>` alone builds only that package's directory, and its tests compile against `@poodle64/design-tokens`' emitted stylesheets, so against an unbuilt `design-tokens` it finds nothing; the `{./packages/ui}...` form builds the dependency first.

There is no lint tooling. `.prettierrc` records the house style (tabs, printWidth 100, single quotes) so a prettier invoked here does not walk up to an ancestor's 2-space config and reindent whole files.

CI is `.github/workflows/kit-typescript.yaml`, on a pull request touching this directory: build, test and type-check on atlas (a fork's PR on a GitHub-hosted runner), and the ui package driven in a real browser on a GitHub-hosted runner. `security.yaml`'s Trivy scan reads `pnpm-lock.yaml`.

## Releasing a package

Each package versions and tags independently, `design-tokens-v<version>`, `ui-v<version>` or `librarian-v<version>`, so one package's cadence never forces a bump on another; this repo's own `vYYYY.M.x` factory releases trigger nothing here. Each package's README carries its steps: bump `version` (CalVer), update its `CHANGELOG.md`, commit to main, push the tag.

The tag runs `.github/workflows/publish-kit-typescript.yaml`, which re-runs that package's build and tests and publishes by npm OIDC trusted publishing, with provenance: no npm token exists. npm matches each package's trusted publisher on this repository and that workflow's filename, so renaming the file breaks publishing until every package's trusted publisher is re-made on npmjs. Trusted publishing does not support self-hosted runners, so the publish runs on a GitHub-hosted one. Confirm with `npm view @poodle64/<package> version`.
