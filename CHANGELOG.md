# Changelog

All notable changes to this template are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
calendar versioning (`YYYY.M.x`) per `rules-library/core/10-git-workflow.md`.

The git tag is this repo's single source of truth for its version: `copier`
resolves a template by its latest tag, so there is no `VERSION` file to drift
against it. A change is not shipped until the tag is pushed.

## [2026.7.3] - 2026-07-29

### Security

- The embedded MCP surface is now authenticated. The template mounted `/mcp`
  with **no gate at all**, so every app stamped from it shipped that machine
  surface reachable by anything on its network, and nothing in the scaffold
  signalled that it mattered. This is the failure mode
  `rules-library/core/73-verification.md` §Behaviour vs Appearance describes
  exactly: an open surface builds, type-checks and renders perfectly, so no
  existing gate could have caught it. Only driving a request at it proves
  anything.

  `/mcp` now sits behind the household's canonical Authentik bearer gate,
  lifted verbatim from godswood (`mcp/http_auth.py` and `mcp/actors.py` are
  byte-identical to the copies in godswood and seshat, and name no service, so
  they stamp unmodified and stay carbon copies). Each `/mcp` HTTP request must
  carry an Authentik OAuth2 bearer that validates against the OIDC userinfo
  endpoint; the gate is the sole writer of `x-client-id`, stripping any
  client-supplied value, so a caller cannot self-declare an identity.

  `mcp/auth.py` resolves that identity to an Actor through `config/actors.yaml`
  and the scaffold's `health_check` tool calls it, so the allow-list is
  load-bearing rather than decorative. Both halves are needed: Authentik serves
  one instance-wide userinfo endpoint that accepts a valid token from any
  application on the instance, so the bearer check proves identity alone and
  the allow-list is what restores the app boundary.

### Added

- `config/sections/mcp.py` (`MCPSettings`), composed onto the root `Settings`,
  giving a stamped app four runtime-driven variables prefixed with its own
  name: `<APP>_OIDC_USERINFO_URL`, `<APP>_OIDC_IDENTITY_CLAIM` (default
  `preferred_username`), `<APP>_OIDC_RESOURCE_METADATA_URL`, and
  `<APP>_ACTORS_CONFIG_PATH` (default `config/actors.yaml`). Pointing an app at
  a different identity provider is a config change, never a rebuild.
- An **unset userinfo URL fails closed**: every `/mcp` request 401s. That is
  the shipped default, so a fresh stamp runs locally with no identity provider
  and its machine surface is shut rather than open. `create_app()` logs a
  warning naming the variable, so the closed state is never a mystery.
- `config/actors.yaml`, seeded with the `local-console` principal and the
  household's shared `mcp-service` gateway consumer.
- `tests/test_mcp_auth.py`: eleven tests that *drive* the gate rather than
  import it, faking the userinfo endpoint with `httpx.MockTransport`. Covers
  no-token, provider-rejects, provider-unreachable (503, never open), unset-URL
  fail-closed, valid-token-passes with identity injected, client-supplied
  `x-client-id` stripped, `sub` fallback, allow-list refusal, and two
  integration checks driving the real mount, including one proving the human
  surface's `x-authentik-*` headers do not open the machine surface.
- `pyyaml` as a backend runtime dependency (the actor-registry loader), and a
  comment on `httpx` recording that the gate's userinfo client is what needs it.

### Fixed

- `cp .env.example .env`, the template's own documented dev path, made a
  stamped app refuse to start. The root `Settings` model read that file under
  pydantic-settings' default `extra="forbid"`, and `.env.example` ships nothing
  *but* section-owned keys (`POSTGRES_*`, and now the MCP auth block), so every
  one came back as "Extra inputs are not permitted". Sections now read the
  shared `.env` themselves and ignore keys they do not own, which is what a
  composed-settings model needs: the root owns the unprefixed keys, each
  section owns its prefix, and a key belonging to a sibling is not an error.
  This is the shape godswood already runs. Found while driving the new
  `<APP>_OIDC_*` variables, which landed in the same trap.
- Settings and the SPA directory now resolve from the module rather than the
  working directory, via a new `config/paths.py`. `uvicorn` starts in
  `backend/` in dev (`.envrc`, `launch.json`'s `cwd`) and at the repo root in a
  container, so a relative path finds the target in one case and silently not
  the other. `_FRONTEND_BUILD` had exactly that defect: launched from
  `backend/`, `frontend/build` did not resolve, so a stamped app logged a
  warning and served no SPA at all.

### Changed

- `main.py` mounts the **gated** app while chaining the lifespan from the
  **raw** one. `raw_mcp_app` carries the FastMCP lifespan (the streamable-HTTP
  session manager's task group lives there), so wrapping the wrong one either
  leaves the session manager unstarted or leaves `/mcp` open. The gate's
  userinfo `httpx` client is closed on shutdown so its connection pool does not
  leak across app-factory lifecycles.
- The human surface is untouched and stays a separate concern. A machine caller
  does not traverse the human proxy, so trusting `X-authentik-*` on `/mcp`
  would be a bypass (`rules-library/auth-patterns/proxy-delegated-auth.md`
  §Scope). The sibling apps confirm browser-side auth is genuinely per-app, so
  it stays out of the template. `vite.config.ts` now says so at the proxy entry
  that made it look otherwise.

## [2026.7.2] - 2026-07-28

### Fixed

- The stamped `app.css` now imports `@poodle64/ui/styles.css`, so the shared
  components have a colour surface behind them. The scaffold declared the
  shadcn semantic names (`--card`, `--popover`, `--muted`, `--accent`,
  `--input`, `--secondary`, and their `-foreground` pairs) as plain custom
  properties in a `:root, .dark` block. That makes the variable exist but never
  tells Tailwind v4 they are theme colours, so `bg-card`, `bg-popover`,
  `bg-muted`, `bg-accent`, `bg-secondary` and `border-input` compiled to no CSS
  rule at all: no build error, no lint hit, no failing test, just classes in
  the DOM with nothing behind them. Every app stamped from this template
  inherited it — dropdowns with no hover state, inputs with no border, cards
  and popovers with no surface colour (`poodle64/design-system#3`).

### Changed

- The per-app shadcn alias block is deleted. `@poodle64/ui@2026.7.2` ships that
  whole surface itself, mapping *and* Tailwind registration, so an app writing
  its own would only fight it. A stamped app now differentiates its palette
  through `--ds-color-*` alone. Sidebar and chart colours stay per app: the
  package ships no sidebar or chart component, and chrome hue is genuinely an
  app's own decision, so the scaffold still declares and registers those.
- The block's five `--status-*` convenience aliases go with it. Nothing in the
  scaffold read them, and `@poodle64/design-tokens` already registers
  `--color-status-*`, so `bg-status-success` and friends were always the
  working path.
- `@poodle64/ui` and `@poodle64/design-tokens` version specs raised to
  `^2026.7.2`.

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

[2026.7.2]: https://github.com/poodle64/full-stack-app-template/compare/v2026.7.1...v2026.7.2
[2026.7.1]: https://github.com/poodle64/full-stack-app-template/compare/v2026.7.0...v2026.7.1
[2026.7.0]: https://github.com/poodle64/full-stack-app-template/releases/tag/v2026.7.0
