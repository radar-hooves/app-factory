# Changelog

All notable changes to this template are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
calendar versioning (`YYYY.M.x`) per `rules-library/core/10-git-workflow.md`.

The git tag is this repo's single source of truth for its version: `copier`
resolves a template by its latest tag, so there is no `VERSION` file to drift
against it. A change is not shipped until the tag is pushed.

## [2026.7.1] - 2026-07-28

### Added

- The shared `@poodle64/ui` component package is now the scaffold's component
  system, replacing the vendor-per-app pattern. The stamped layout imports
  `Toaster` from `@poodle64/ui/sonner`, and `app.css` carries a Tailwind v4
  `@source` line pointing at the package's `dist/` so its classes are scanned.
  Without that line the shared components render unstyled, with no build error
  and no lint hit. WP-51 Lane WP (`master-project#174`).
- Stylelint rules covering Tailwind v4's at-rules and the household's unitless
  `oklch()` convention, so the standard config's CSS-spec defaults stop
  reporting the house style as errors.
- The README documents the tag-or-it-did-not-ship obligation: a template change
  pushed without a tag reaches zero apps, silently (`master-project#161`).

### Changed

- `clsx` and `tailwind-merge` are no longer declared by the stamped frontend;
  they now arrive through `@poodle64/ui`.
- `bits-ui` raised to `^2.18.1` to match the package's peer range, so the app
  and the package resolve one shared instance rather than two.

### Fixed

- ESLint no longer crashes on a fresh stamp. `eslint-plugin-tailwindcss` 4.2.0
  dropped the `flat/recommended` export the config loaded, and its
  `no-arbitrary-value` rule is inoperative under Tailwind v4 regardless, with
  no `tailwind.config.js` to introspect. The plugin is removed; the binding
  raw-value gate is the grep gate in the master `frontend-ci.yaml` reusable.
- Stylelint now passes on a fresh stamp instead of failing on the scaffold's
  own `app.css`.
- `svelte-sonner` stays declared in the stamped `package.json`. It is an
  *optional* peer of `@poodle64/ui`, so pnpm resolves it into that package's
  private tree, where app code cannot import it: the scaffold shipped a
  `Toaster` that a stamped app could not raise a toast into, and every gate
  stayed green because nothing in the scaffold called `toast()` yet.
- The seven inherited master governance symlinks are wired in this repo. All
  were absent, so master rules, commands, agents and skills did not load here
  and the `.claude/hooks/master` hooks could not resolve.

## [2026.7.0] - 2026-07-05

### Added

- First tagged release of the canonical full-stack-app template as a
  standalone copier source, extracted from `poodle64/master-project` with
  history preserved so that copier has a tagged VCS source of its own.

[2026.7.1]: https://github.com/poodle64/full-stack-app-template/compare/v2026.7.0...v2026.7.1
[2026.7.0]: https://github.com/poodle64/full-stack-app-template/releases/tag/v2026.7.0
