# Changelog

All notable changes to this template are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow calendar versioning (`YYYY.M.x`) per `rules-library/core/10-git-workflow.md`.

The git tag is this repo's single source of truth for its version: `copier` resolves a template by its latest tag, so there is no `VERSION` file to drift against it. A change is not shipped until the tag is pushed.

## [2026.8.5] - 2026-08-13

`fixxxer` was the first repo taken through the ADOPT path — stamped over an existing, unstamped app rather than scaffolded fresh. Everything below is a defect that run surfaced, each one invisible to a greenfield stamp because a fresh app never drives the surface it breaks.

### Fixed

- **The SPA mount 404d every client-side deep link.** `StaticFiles(html=True)` serves `index.html` for a directory, not for a path the client router owns, so a stamped app was reachable only from its root: `/items/1` returned JSON 404 rather than the app. `main.py` now falls back to `index.html` on a 404, except under `_app/`, where a miss is a genuinely missing asset and must stay a 404 rather than return HTML to a script tag.
- **The Vite dev proxy could not authenticate against its own backend.** The Authentik identity headers sat on `server.headers`, which sets headers on Vite's response to the browser — the backend never saw them, so every `/api` call 401d and the client bounced to the Authentik outpost. They move onto the `/api` proxy entry, which is what `proxy-delegated-auth.md` §Development specifies.
- **`alembic.ini` lost `path_separator`**, so every alembic invocation printed two deprecation warnings and fell back to splitting paths on spaces.
- **`conftest.py`'s "point the suite at a real test server" message rendered as `(Undefined, Undefined, Undefined, Undefined)`** — jinja evaluated the literal `{HOST,PORT,USER,PASSWORD}` brace group instead of emitting it.
- **`exceptions.py` and `logging.py` were wrapped narrower than the line length the template's own ruff config stamps**, so the first `ruff format` in a stamped repo rewrote them and the first commit carried a formatting diff nobody authored.
- **`app.css` re-declared `@custom-variant dark` and imported `tw-animate-css`**, both of which `@poodle64/ui/styles.css` has owned since `2026.7.6`; `sveltekit-frontend.md` forbids an app carrying either. The app-level `tw-animate-css` dependency goes with them.
- **The sidebar tokens hardcoded a near-black in the light `:root` block**, so a stamped app that grows a drawer gets a dark rail in light mode. They now track the shared surface ladder (`--ds-color-surface-1`/`-2`), which moves with the palette instead of pinning a second neutral.

### Added

- **An ADOPT procedure in the README** — stamping over an existing app, and the six reconciliation steps that are not obvious from the greenfield path.

## [2026.8.4] - 2026-08-13

Only 3 of the estate's 10 full-stack apps were ever stamped from this template, and all at old tags. `godswood` and `cadmus` — the two apps `canonical-app-shape.md` names as its reference implementations — were never stamped at all. Hand-built, never downstream of the factory, they each grew the same scaffolding alone and diverged doing it. This release harvests what they grew, settles every disagreement once, and makes the template the canonical source rather than the trailing one.

### Changed — the two design gates are now one version each

`check-ui-drift.mjs` and `check-design-craft.mjs` existed in three divergent copies: template 216/229 lines, godswood 364/330, cadmus 395/379, all different from each other. Both apps had independently grown their gates roughly 80% past the template. Each gate is now a single version, the union of the genuinely better behaviour.

**check-ui-drift.mjs.** Keeps the template's `import.meta.url` anchoring — the script resolves the same paths from pre-commit's cwd (repo root) and from `pnpm lint:drift` (frontend/), which neither app's `process.cwd()` version can. Adopts godswood's **delegating-composition exemption**: a local file that imports the shipped component of the same name is a wrapper, not a fork, and name-only matching flagged a legitimate one that would have been "fixed" by deleting it. Carries cadmus's third rule, `surface-brief-divergence`, which the template had deliberately dropped — it is inert without `docs/product/surfaces/`, so an app that keeps no briefs never sees it fire, while an app that adopts them gets the gate instead of re-porting it. Carrying it brings back the non-uniform baseline key it needs: one page can compose several undeclared components, so a uniform `${rule}:${file}` key banks them all at once and goes silent exactly when a new divergence lands. Cadmus's `records/` exemption is **not** inherited — it is an app concept, and a route that legitimately owns its title banks the finding instead.

**check-design-craft.mjs.** Carries **live mode** from both apps as an opt-in `--live` flag (`pnpm lint:design:live`), with pre-commit still static-only. Dropping the capability did not stop apps having it; it only meant each one ported it back by hand. Keeps the template's honouring of impeccable's own `severity: "advisory"` classification, which neither app has. Ships the three prose suppressions both apps independently agreed on (`em-dash-overuse`, `marketing-buzzword`, `aphoristic-cadence`) — these are household writing conventions reaching the UI as-is, not UI defects, and an empty default just made every app re-derive the same call. App-measured suppressions are still argued locally and never inherited from another app's measurements.

The scripts move to a `.jinja`-rendered form where they need the app's name or port; both baselines stay app-owned via `_skip_if_exists`.

### Added — backend production runtime

- **`backend/entrypoint.sh` and `backend/gunicorn.conf.py`.** The template had neither, so every app reinvented production startup. Startup is now migrate → stamp the deployment environment → `exec gunicorn`, and the Dockerfile hands off to it rather than running migrations inline, so the stamp re-arms on every boot. Worker count uses godswood's container-aware formula, not cadmus's `cpu_count() * 2 + 1`: inside a cgroup-limited container that reads the **host's** cores and over-provisions into the OOM killer.
- **Deployment-environment stamp** (`db/environment.py`, `db/stamp.py`, `tests/support/explicit_server_guard.py` and its tests). Development points at the real database and a tunnel makes production present as localhost, so no client-side check can tell them apart; the suite reads a marker row in the database itself and refuses to run against one that declares itself production. Both apps built this independently, fail-closed in both.
- **A REST health endpoint** (`GET /api/system/health`). The template had none at all — only an MCP `health_check` tool. The shape is the union: cadmus's typed liveness response (`status`, `version`, `environment`, `timestamp`) plus godswood's `SELECT 1` dependency ping, the only check permitted to return 503.
- **Middleware the household rules already required and the template omitted**: request-ID propagation (godswood's; cadmus has none), request logging with timing, security headers, and configurable CORS. Headers are set in Python, cadmus's call — godswood punts them to nginx, and an app must be safe standalone.
- **Secret redaction in the log formatter** (godswood's; neither the template nor cadmus had it): JWTs, `Bearer` tokens, `password`/`token`/`secret`/`api_key` pairs and emails.

### Added — frontend scaffolding

`vitest.config.ts` (cadmus's minimal baseline, not godswood's memory-tuned one — that solves a large-suite problem a fresh app has not got), `playwright.config.ts`, `components.json` and `src/lib/utils.ts`'s `cn()`, `src/app.d.ts`, `src/lib/api/index.ts`, a 30-second request timeout, and `redirectToAuthentik()` with the 401 middleware that calls it.

Playwright takes cadmus's safety pattern, and the reason generalises: there is one database and no staging environment, so the E2E suite gets a **dedicated port**, a **dedicated synthetic identity**, and `reuseExistingServer: false`. A run must never adopt the session the operator has open. Reporters take godswood's fuller set, a strict superset.

Example `vitest` and `playwright` specs ship, so a fresh stamp's suites run green instead of exiting 1 on "no test files found" — with CI now running frontend tests, a scaffold that cannot pass its own suite is a gate disabled in week one.

### Added — root, CI and container

`.gitleaks.toml` (the template shipped the gitleaks hook with no paired config, so the first placeholder in a stamped `.env.example` blocked the initial commit — both apps had written the same allowlist), the two handoff-governance pre-commit hooks, and `cleanup-container-images.yaml`. The Dockerfile pins pnpm through `corepack prepare` (both apps hit a floating pnpm breaking the build), stamps `GIT_COMMIT`, and runs as a generic `appuser` at uid 1000, matching the numeric `--chown` every `COPY` already used.

### Fixed

- **`check-pii` pointed at a hook path that no longer exists.** Both apps agree the current path is `.claude/hooks/master/precommit/pii.py`; the template's hook had been running nowhere.
- **CI ran no frontend tests.** The reusable defaults `run-tests` to `false` and the template never set it. It also lacked `packages: read`, without which the reusable's install of `@poodle64/*` from GitHub Packages loses its token — a caller's permissions are the ceiling for what it calls.
- **Three config bugs a fresh stamp shipped with.** stylelint rejected Svelte's `:global()` and Tailwind v4's `@utility`/`@plugin`; eslint failed on any deliberately-unused `_arg`. All three would have bitten the first real component.
- **The API client had no `onError` middleware**, so a network failure or timeout abort threw past every call site's `if (error)` contract and leaked its timeout timer. `sveltekit-api-client.md` requires that path normalised once.
- **`extractApiError` reported a network failure as a bare "Error".** It checked the backend envelope first, and an `Error` is an object carrying a string `message`, so a `TypeError` from a failed fetch matched that branch and the `instanceof TypeError` arm below was unreachable. Found by the scaffold's own new example spec.
- **`eslint-plugin-tailwindcss` is back.** The template had dropped it because v4's flat/`recommended` export crashes ESLint; both apps run the same version fine by wiring the rule directly and never importing that export.
- **Local copies of the `WithoutChild`/`WithElementRef` type helpers dropped** — `@poodle64/ui` ships its own, and `sveltekit-frontend.md` §Utils calls a local copy a fork. `tsconfig.json` gains the `noUncheckedIndexedAccess` and `verbatimModuleSyntax` that `typescript-basics.md` requires.

### Settled prose

Where the three trees said the same thing three ways, one wording wins and the template carries it: pre-commit hook names keep the plain `'<domain> - <Sentence case>'` style (cadmus already matched; godswood's emoji/`·` style is the outlier); the exception hierarchy takes `BackendBaseException` / `AuthenticationError` / `ForbiddenError` / `UpstreamServiceError` / `ServiceUnavailableError`, which is where both apps converged **against** the template's `AppError`/`AuthError`, with `ForbiddenError` beating godswood's `PermissionError` because that shadows a Python builtin; the API error shape is `ApiErrorInfo`, which cannot collide with an `ApiError` a generated OpenAPI schema may define; the toast mount keeps `Toaster` with cadmus and godswood's `closeButton position="top-right"`.

`.pii-patterns.json` was deliberately **not** harvested despite both apps carrying one: `docs/master/templates/pre-commit-config.md` is explicit that the repo-local file is added on demand, because an empty stub in every repo reads as coverage it does not provide.

### Proof — two real stamps, driven

- **`has_frontend: true`** renders with no unresolved Jinja and no leaked reference-app names. Backend: `uv sync` then **33 tests pass**. Frontend: `pnpm install` (no interactive esbuild prompt), `pnpm build`, `pnpm check` (407 files, **0 errors**), `pnpm lint`, `pnpm lint:css` all clean; `pnpm test:run` **5 passed**; `pnpm exec playwright test` **1 passed**, driving a real Chromium against the dedicated E2E port.
- **Both gates exit 0 against the freshly stamped tree with empty baselines**, run from both the frontend package and the repo root (the pre-commit cwd) — the failure mode `canonical-app-shape.md` warns about, checked rather than assumed.
- **`has_frontend: false`** renders with no frontend directory and no design hooks in the rendered pre-commit config; every YAML and JSON file parses; the same 33 backend tests pass.

## [2026.8.3] - 2026-08-10

### Added

- **The UI-drift gate is now stamped into every `has_frontend` app — the sibling of the design-craft gate (2026.8.2).** `frontend/scripts/check-ui-drift.mjs` reads the component set `@poodle64/ui` actually ships and fails the app for hand-rolling what the package already provides, as a `repo: local` pre-commit hook (`design-drift`) gating on NEW findings against `frontend/.ui-drift-baseline.json`. It catches the reuse class every other gate is blind to — a hand-written component compiles, renders, type-checks and passes its tests, and is only wrong once a human sees it does not match the rest of the app. `canonical-app-shape.md` has bound every app to this gate (naming `repos/cadmus/scripts/check-ui-drift.mjs` as the reference implementation) since before the craft gate; until this stamp nothing wired it — coverage outrunning implementation, the same rule-outruns-wiring defect the craft gate closed a version earlier.
  - **Two checks, both universal to any app on the shared package.** (1) A local `.svelte` component whose name matches one the package ships — `components/ui/` excluded, since those are the app's own shadcn primitives for what the package genuinely does not ship. (2) A route writing its own `<h1>` instead of composing the shared `PageHeader`.
  - **The third cadmus check is deliberately not carried.** Cadmus also fails a route composing a component its surface brief does not name; surface briefs were not promoted to the household standard (master-project#249 — four briefs against thirty routes in cadmus's own home app), so a template demanding them would enforce a contract the estate has decided against. An app that adopts surface briefs adds that check back locally, with its own `docs/product/surfaces/` contract behind it.
  - **Anchored to the frontend package, not a repo root.** Cadmus's reference keys off `process.cwd()` and a root pnpm workspace; the household template nests the frontend, so the script resolves its paths from `import.meta.url` and runs identically from the pre-commit cwd (repo root) and `pnpm lint:drift` (frontend/). Its baseline key stays the uniform `${rule}:${file}` because both carried rules are one-finding-per-file — with a comment preserving cadmus's measured fail-open lesson should a multi-per-file rule ever be added back.
  - **The baseline is app-owned:** stamped once empty and added to `_skip_if_exists`, so `copier update` never wipes the debt an app has banked. The script is template-owned and updates normally. `pnpm lint:drift` runs it by hand.
  - The hook is wrapped in the existing `{% if has_frontend %}` block, so a backend-only stamp never carries a gate it cannot run.

### Fixed

- **The template's own starter `+page.svelte` was itself violating the invariant the new gate enforces** — it wrote a raw `<h1>`/`<p>` page title instead of composing the shared `PageHeader`, so every app ever stamped from this template was born non-conformant, caught by nothing. It now composes `PageHeader title=… subtitle=…`. This surfaced exactly as the drift gate's own proof demanded: a fresh stamp could not pass an empty baseline until the scaffold itself was made conformant — which is the finding, not a reason to pre-populate a baseline.

### Proof — a real stamp, driven, not a copy-paste claim

- A `has_frontend=true` stamp scans clean against the empty baseline: exit 0, zero findings, from both the pre-commit cwd (repo root) and `pnpm lint:drift` (frontend/), against the real `@poodle64/ui` component set. The design-craft gate still passes on the same fixed scaffold.
- Run against the pre-fix scaffold, the gate failed on `src/routes/+page.svelte [hand-rolled-page-title]` — the template defect fixed above, caught by the gate that now ships beside the fix; `page-header` sat unused in the gate's own "never imports" list, precisely what the scaffold should have been composing.
- Real violations fail it: a local `Card.svelte` duplicating `@poodle64/ui/card` and a second route writing its own `<h1>` produced exit 1 naming both, while an app-owned `components/ui/…/Card.svelte` was correctly exempt. Banking them with `--baseline` grandfathers them (exit 0); a further new `Badge.svelte` then fails on the new one alone. A missing `@poodle64/ui` exits 2 with a clear message, never a silent pass.
- A `has_frontend=false` stamp renders valid YAML with both design hooks cleanly absent.

## [2026.8.2] - 2026-08-10

### Added

- **The design-craft gate is now stamped into every `has_frontend` app, so a freshly stamped app carries it from birth.** `frontend/scripts/check-design-craft.mjs` wraps `impeccable@3.5.0` (an offline anti-pattern detector — no LLM, no API key, no network) in a baselined debt register and runs as a `repo: local` pre-commit hook (`design-craft`), gating on NEW hard findings against `frontend/.design-craft-baseline.json`. It catches the craft class every other gate is blind to — a nested card, a side-tab accent border, gradient-text, decorative slop — that compiles, renders, type-checks and passes its tests, and is only wrong once a human looks at the rendered page. `impeccable` joins the frontend dev dependencies and `pnpm lint:design` runs it by hand. Promoted into `rules-library/platform/canonical-app-shape.md` on 2026-08-10 on cadmus's measured record; until this stamp, the rule bound every app to the gate while nothing wired it — coverage outrunning implementation, the exact failure the household's secrets rule names elsewhere.
  - **Static mode only.** impeccable's `--live` browser sweep is deliberately not carried across: the rule makes only static mode binding, and a browser-driving pre-commit hook buys flakiness for no proven return. The script drops all of cadmus's live-mode machinery (browser resolution, route/viewport sweeps, the `live:` baseline namespace).
  - **Hard vs advisory split.** Hard findings fail the commit; advisory findings are reported, never fail, never baselined — roughly two thirds of what such a detector reports on a real app is noise, and a version without the split gets `--no-verify`'d within a week. The script honours impeccable's own `severity: "advisory"` classification directly (a decorative grid background, em-dash saturation), so a natively-advisory tell can never fail a commit — a correctness fix over the reference script, which enumerates those by hand.
  - **Empty app-local advisory set, on purpose.** Cadmus carries nine advisory suppressions; every one is either a live-mode finding a static gate never produces (`low-contrast`, `clipped-overflow-container`, `layout-transition` on the shared shell) or a cadmus-specific taste call (its single typeface, its own `app.css` atmosphere glows). None is both static-reachable and universal, so a fresh app inherits none — suppression is argued per app with a dated reason, never silently inherited.
  - **The baseline is app-owned:** stamped once empty and added to `_skip_if_exists`, so `copier update` never wipes the debt an app has banked. The script is template-owned and updates normally.
  - The hook is wrapped in `{% if has_frontend %}` (the shipped `.pre-commit-config.yaml` became a `.jinja` to allow the conditional), so a backend-only stamp never carries a gate it cannot run.
- **Proof — a real stamp driven both ways, not a copy-paste claim.**
  - A `has_frontend=true` stamp scans clean against the empty baseline: exit 0, zero findings, from both the pre-commit cwd (repo root) and `pnpm lint:design` (frontend/). The template's own generated markup trips nothing static, so nothing needed pre-populating and no template markup defect surfaced.
  - A real violation fails it: a side-tab accent border and a gradient-text heading added to the starter `+page.svelte` produced exit 1 naming `src/routes/+page.svelte [side-tab]` and `[gradient-text]`. Banking them with `--baseline` grandfathers them (exit 0); a further new side-tab in another file then fails on the new one alone; a natively-advisory grid background is reported under advisory and passes.
  - A `has_frontend=false` stamp renders valid YAML with the hook cleanly absent.

## [2026.8.1] - 2026-08-06

### Added

- **This repo's own root now carries a `.pre-commit-config.yaml`** (gitleaks + the household `check-pii` hook + standard file hygiene), separate from the `template/.pre-commit-config.yaml` stamped into scaffolded apps. Previously commits to `copier.yml`, `README.md`, and everything under `template/` carried no PII guard and no secret scan at all — only the apps this repo produces were protected, never the factory itself. Installed and driven both directions: a staged PII-shaped probe is blocked, a clean probe passes.
- **`template/.github/workflows/security.yaml.jinja`**: a thin caller of the master-project `security-checks.yaml` reusable (gitleaks, Python dependency audit, Trivy filesystem scan, CycloneDX SBOM — `node-dir: frontend` added only when `has_frontend`), so every scaffolded app inherits CI security scanning from day one. Previously the template shipped `canonical-shape.yaml`, `python-ci.yaml`, `frontend-ci.yaml` and `auto-label-issues.yaml` but no security workflow at all, and the reusable had zero callers estate-wide. Verified by a real `copier copy` in both `has_frontend` states — both renders parse as valid YAML and pass the correct `working-directory`/`node-dir` inputs the reusable actually declares.

### Investigated (not fixed — see rationale)

- **Gap 3, `.claude/hooks/master/check-pii.py` symlink provisioning**: `template/.pre-commit-config.yaml` references a path copier itself never provisions (no `.claude` in the template tree, no `_tasks` entry). Confirmed via a real `copier copy`: the symlink is genuinely absent from raw output. Left unfixed — the sanctioned entry point (`/scaffold-project`) already creates every governance symlink at step 3, strictly _before_ the copier stamp at step 4d, so the path always resolves by the time `pre-commit install` runs in practice. A `_tasks` entry would duplicate that already-correct logic, hard-codes the `repos/<name>/`-under-master relative depth copier cannot itself verify, and — because `_tasks` re-run on every `copier update`, not just `copy` — would execute against every existing scaffolded app's tree on its next update, a blast radius disproportionate to guarding against a raw `copier copy` invoked outside the documented flow. Reported for an operator decision rather than hacked in.

## [2026.8.0] - 2026-08-01

### Added

- The stamped `.vscode/settings.json` gains a `[markdown]` block (`esbenp.prettier-vscode` as default formatter, format-on-save on), and the stamped `extensions.json` recommends `esbenp.prettier-vscode` unconditionally — markdown exists in every stamp, frontend or not. This is the master-project#92 charter decision (master's own `.vscode` got the same block in master commit 6013509): the household markdown standard is `proseWrap: never` (one line per paragraph), declared in the master `.prettierrc` that cascades to every app nested under the master tree.

  Formatter resolution, verified rather than assumed: the stamped frontend's `package.json` does **not** carry `prettier` as a devDependency (only `eslint-config-prettier`, which silences ESLint rules and brings no formatter), and neither do the live apps. It would not help if it did — the extension resolves the `prettier` module walking up from the _file being formatted_, and root-level markdown (`README.md`, `DESIGN.md`) never sees `frontend/node_modules`. What actually resolves, for an app nested under the master tree, is the master root's own workspace install (`node_modules/prettier` + `prettier-plugin-svelte`, landed with master commit 6013509), which also sits beside the cascading `.prettierrc` so its svelte plugin loads. A standalone checkout outside the master tree falls back to the extension's bundled prettier with no cascading config — format-on-save still works, just without the household overrides.

## [2026.7.5] - 2026-07-31

### Changed

- **`db_mode` is gone — sync SQLAlchemy is the only mode.** Per the operator's ratified household standard (`rules-library/platform/canonical-app-shape.md`: godswood ran the async experiment and came back, and an agent workforce writes materially safer sync code), the `db_mode` copier question is removed and every `{% if db_mode == ... %}` branch in the template collapses to the sync path: sync `create_engine`, `psycopg2-binary`, a sync session factory, sync `alembic/env.py`, sync route handlers in the example domain. An existing app's `.copier-answers.yml` carrying `db_mode` is unaffected; `copier update` ignores answers for removed questions.
- **The stamped test suite is now hermetic.** `backend/tests/conftest.py` is rebuilt on the household pattern (`rules-library/stacks/python-testing.md` §Database Integration Tests, ported from mission-command `backend/tests/conftest.py`): an ephemeral `postgres:17-alpine` testcontainer per session (random password/port), a `<PROJECT>_TEST_POSTGRES_{HOST,PORT,USER,PASSWORD}` override quartet (all-or-none, with a loud warning on a partial set), assignment over ambient `POSTGRES_*` with `POSTGRES_DB` forced to `<package>_test`, and schema built via `alembic upgrade head` in a subprocess with a head-revision assertion; never `create_all`, never the shared dev instance. The existing identity-header client and savepoint-based rollback session fixtures keep working on top. `testcontainers[postgres]` joins the stamped dev dependency group.

### Added

- `backend/alembic/versions/` ships an initial migration creating `example_items`, so the hermetic harness's `alembic upgrade head` has a real schema to build. Previously the versions directory was empty, and the example domain's table only existed on the strength of a matching model definition.
- `services/fanout.py`: a bounded `ThreadPoolExecutor` helper (`run_fanout`) for an endpoint that genuinely fans out I/O inside the sync world: the concurrency valve `30-canonical-app-shape.md` names as the replacement for an app-wide async flip. Submits a list of callables, bounds workers, and captures each callable's exception on its own result; never a silent swallow. Covered by a stamped unit test.

## [2026.7.4] - 2026-07-31

### Added

Stamps the full scaffolding set so a new app copies nothing from a sibling (master-project#230 ruling 1, poodle64/full-stack-app-template#3). Previously `template/` stamped only `backend/`, `frontend/`, `config/`, `.vscode/`, `renovate.json` and the answers file; everything else was hand-copied from whichever app happened to be handy, which is how mission-command inherited a committed `.env.example` carrying a literal unrendered `{{ project_name }}` and how the six live apps drifted three different ways on the same files.

- `.pre-commit-config.yaml`, root `.envrc`, `.gitattributes`, `.gitignore`, and an empty `.mcp.json` — the convergent files every app needs and none should hand-author.
- `.github/workflows/canonical-shape.yaml`, `python-ci.yaml` and `auto-label-issues.yaml` (always; a public repo deletes the auto-label caller as a recorded deviation, since it cannot resolve the private reusable — `core/10-ci-workflow-standard.md`), `frontend-ci.yaml` (only when `has_frontend`, closing #1) — thin callers of the `poodle64/master-project` reusables, verified live on first push.
- The stamped `.gitignore` instantiates the canonical structure from `docs/master/templates/gitignore.md`, including the `.vscode` allow-list whose leading `!.vscode/` defeats a user-global `.vscode/` ignore — without it a freshly stamped app's `.vscode` files silently never reach git.
- `DESIGN.md` and `README.md` skeletons. Both are app-owned the moment they are stamped, so `copier.yml` now lists them in `_skip_if_exists`: `copier update` creates them once and never touches them again.
- The Docker/deploy set: `Dockerfile` (multi-stage — a frontend build stage only when `has_frontend`, a `uv`-native backend build, a non-root runtime), `compose.yaml` (a local image-build-and-smoke-test compose against the shared dev Postgres — not the production stack, which lives in the fleet repo), and `.dockerignore`. The canonical shape had no deploy story at all; this defines the household's first one.
- `+layout.svelte` now wraps every route in `@poodle64/ui`'s `AppShell` instead of a bare fragment, and `+page.svelte` drops its own `<main>` now that the shell supplies one. Hand-rolling the shell per app was the recorded gap master-project#230 Finding 5 flagged; this is the template's own migration off it.

### Fixed

- `backend/pyproject.toml`'s `db_mode` conditional left indented whitespace-only lines in every rendered app regardless of which branch fired, tripping pre-commit's `trailing-whitespace` hook on the very first run. Found and fixed while building the round-trip verification for the additions above.

## [2026.7.3] - 2026-07-29

### Security

- The embedded MCP surface is now authenticated. The template mounted `/mcp` with **no gate at all**, so every app stamped from it shipped that machine surface reachable by anything on its network, and nothing in the scaffold signalled that it mattered. This is the failure mode `rules-library/core/73-verification.md` §Behaviour vs Appearance describes exactly: an open surface builds, type-checks and renders perfectly, so no existing gate could have caught it. Only driving a request at it proves anything.

  `/mcp` now sits behind the household's canonical Authentik bearer gate, lifted verbatim from godswood (`mcp/http_auth.py` and `mcp/actors.py` are byte-identical to the copies in godswood and seshat, and name no service, so they stamp unmodified and stay carbon copies). Each `/mcp` HTTP request must carry an Authentik OAuth2 bearer that validates against the OIDC userinfo endpoint; the gate is the sole writer of `x-client-id`, stripping any client-supplied value, so a caller cannot self-declare an identity.

  `mcp/auth.py` resolves that identity to an Actor through `config/actors.yaml` and the scaffold's `health_check` tool calls it, so the allow-list is load-bearing rather than decorative. Both halves are needed: Authentik serves one instance-wide userinfo endpoint that accepts a valid token from any application on the instance, so the bearer check proves identity alone and the allow-list is what restores the app boundary.

- The `local-console` principal is refused over HTTP. `ActorRegistry` seeds that identity unconditionally as the trusted in-process caller, so it is registered even when `config/actors.yaml` omits it. Combined with the instance-wide userinfo endpoint above, a token minted for _any_ application whose identity claim happened to equal `local-console` would otherwise have resolved to the `principal` actor, regardless of the allow-list. The transport check now reserves it for genuine stdio callers. This is closed in the template's own `mcp/auth.py`; the shared `actors.py` stays a byte-identical carbon copy, and the same hardening for the five apps already running the gate is raised separately (see the report accompanying this release).

### Added

- `config/sections/mcp.py` (`MCPSettings`), composed onto the root `Settings`, giving a stamped app four runtime-driven variables prefixed with its own name: `<APP>_OIDC_USERINFO_URL`, `<APP>_OIDC_IDENTITY_CLAIM` (default `preferred_username`), `<APP>_OIDC_RESOURCE_METADATA_URL`, and `<APP>_ACTORS_CONFIG_PATH` (default `config/actors.yaml`). Pointing an app at a different identity provider is a config change, never a rebuild.
- An **unset userinfo URL fails closed**: every `/mcp` request 401s. That is the shipped default, so a fresh stamp runs locally with no identity provider and its machine surface is shut rather than open. `create_app()` logs a warning naming the variable, so the closed state is never a mystery.
- `config/actors.yaml`, seeded with the `local-console` principal and the household's shared `mcp-service` gateway consumer.
- `tests/test_mcp_auth.py`: fourteen tests that _drive_ the gate rather than import it, faking the userinfo endpoint so none of them needs a live identity provider. Covers no-token, provider-rejects, provider-unreachable (503, never open), unset-URL fail-closed, valid-token-passes with identity injected, client-supplied `x-client-id` stripped, `sub` fallback, and allow-list refusal. Five integration tests drive the real mount through a full MCP handshake to an actual `tools/call`: one proves a **registered** identity reaches the tool, one proves an identity whose bearer **validates** but which is absent from `actors.yaml` is refused there, one proves the `local-console` principal is unreachable over HTTP, one proves an unauthenticated request never gets that far, and one proves the human surface's `x-authentik-*` headers do not open the machine surface.

  The suite was mutation-checked rather than assumed: reverting the mount to the raw app (the exact defect this release fixes) turns four of them red, and making the allow-list silently default an unknown identity turns the allow-list test red. A test that cannot fail is not a gate.

- `pyyaml` as a backend runtime dependency (the actor-registry loader), and a comment on `httpx` recording that the gate's userinfo client is what needs it.

### Fixed

- `cp .env.example .env`, the template's own documented dev path, made a stamped app refuse to start. The root `Settings` model read that file under pydantic-settings' default `extra="forbid"`, and `.env.example` ships nothing _but_ section-owned keys (`POSTGRES_*`, and now the MCP auth block), so every one came back as "Extra inputs are not permitted". Sections now read the shared `.env` themselves and ignore keys they do not own, which is what a composed-settings model needs: the root owns the unprefixed keys, each section owns its prefix, and a key belonging to a sibling is not an error. This is the shape godswood already runs. Found while driving the new `<APP>_OIDC_*` variables, which landed in the same trap.
- Settings and the SPA directory now resolve from the module rather than the working directory, via a new `config/paths.py`. `uvicorn` starts in `backend/` in dev (`.envrc`, `launch.json`'s `cwd`) and at the repo root in a container, so a relative path finds the target in one case and silently not the other. `_FRONTEND_BUILD` had exactly that defect: launched from `backend/`, `frontend/build` did not resolve, so a stamped app logged a warning and served no SPA at all.

### Changed

- `main.py` mounts the **gated** app while chaining the lifespan from the **raw** one. `raw_mcp_app` carries the FastMCP lifespan (the streamable-HTTP session manager's task group lives there), so wrapping the wrong one either leaves the session manager unstarted or leaves `/mcp` open. The gate's userinfo `httpx` client is closed on shutdown so its connection pool does not leak across app-factory lifecycles; a failure to close it is logged rather than raised, because an exception from a `finally` block replaces the one propagating out of the `try` and would hide the startup error that matters.
- The human surface is untouched and stays a separate concern. A machine caller does not traverse the human proxy, so trusting `X-authentik-*` on `/mcp` would be a bypass (`rules-library/platform/proxy-delegated-auth.md` §Scope). The sibling apps confirm browser-side auth is genuinely per-app, so it stays out of the template. `vite.config.ts` now says so at the proxy entry that made it look otherwise.

## [2026.7.2] - 2026-07-28

### Fixed

- The stamped `app.css` now imports `@poodle64/ui/styles.css`, so the shared components have a colour surface behind them. The scaffold declared the shadcn semantic names (`--card`, `--popover`, `--muted`, `--accent`, `--input`, `--secondary`, and their `-foreground` pairs) as plain custom properties in a `:root, .dark` block. That makes the variable exist but never tells Tailwind v4 they are theme colours, so `bg-card`, `bg-popover`, `bg-muted`, `bg-accent`, `bg-secondary` and `border-input` compiled to no CSS rule at all: no build error, no lint hit, no failing test, just classes in the DOM with nothing behind them. Every app stamped from this template inherited it — dropdowns with no hover state, inputs with no border, cards and popovers with no surface colour (`poodle64/design-system#3`).

### Changed

- The per-app shadcn alias block is deleted. `@poodle64/ui@2026.7.2` ships that whole surface itself, mapping _and_ Tailwind registration, so an app writing its own would only fight it. A stamped app now differentiates its palette through `--ds-color-*` alone. Sidebar and chart colours stay per app: the package ships no sidebar or chart component, and chrome hue is genuinely an app's own decision, so the scaffold still declares and registers those.
- The block's five `--status-*` convenience aliases go with it. Nothing in the scaffold read them, and `@poodle64/design-tokens` already registers `--color-status-*`, so `bg-status-success` and friends were always the working path.
- `@poodle64/ui` and `@poodle64/design-tokens` version specs raised to `^2026.7.2`.

## [2026.7.1] - 2026-07-28

### Added

- The shared `@poodle64/ui` component package is now the scaffold's component system, replacing the vendor-per-app pattern. The stamped layout imports `Toaster` from `@poodle64/ui/sonner`, and `app.css` carries a Tailwind v4 `@source` line pointing at the package's `dist/` so its classes are scanned. Without that line the shared components render unstyled, with no build error and no lint hit. WP-51 Lane WP (`master-project#174`).
- Stylelint rules covering Tailwind v4's at-rules and the household's unitless `oklch()` convention, so the standard config's CSS-spec defaults stop reporting the house style as errors.
- The README documents the tag-or-it-did-not-ship obligation: a template change pushed without a tag reaches zero apps, silently (`master-project#161`).

### Changed

- `clsx` and `tailwind-merge` are no longer declared by the stamped frontend; they now arrive through `@poodle64/ui`.
- `bits-ui` raised to `^2.18.1` to match the package's peer range, so the app and the package resolve one shared instance rather than two.

### Fixed

- ESLint no longer crashes on a fresh stamp. `eslint-plugin-tailwindcss` 4.2.0 dropped the `flat/recommended` export the config loaded, and its `no-arbitrary-value` rule is inoperative under Tailwind v4 regardless, with no `tailwind.config.js` to introspect. The plugin is removed; the binding raw-value gate is the grep gate in the master `frontend-ci.yaml` reusable.
- Stylelint now passes on a fresh stamp instead of failing on the scaffold's own `app.css`.
- `svelte-sonner` stays declared in the stamped `package.json`. It is an _optional_ peer of `@poodle64/ui`, so pnpm resolves it into that package's private tree, where app code cannot import it: the scaffold shipped a `Toaster` that a stamped app could not raise a toast into, and every gate stayed green because nothing in the scaffold called `toast()` yet.
- The seven inherited master governance symlinks are wired in this repo. All were absent, so master rules, commands, agents and skills did not load here and the `.claude/hooks/master` hooks could not resolve.

## [2026.7.0] - 2026-07-05

### Added

- First tagged release of the canonical full-stack-app template as a standalone copier source, extracted from `poodle64/master-project` with history preserved so that copier has a tagged VCS source of its own.

[2026.8.0]: https://github.com/poodle64/full-stack-app-template/compare/v2026.7.5...v2026.8.0
[2026.7.5]: https://github.com/poodle64/full-stack-app-template/compare/v2026.7.4...v2026.7.5
[2026.7.4]: https://github.com/poodle64/full-stack-app-template/compare/v2026.7.3...v2026.7.4
[2026.7.3]: https://github.com/poodle64/full-stack-app-template/compare/v2026.7.2...v2026.7.3
[2026.7.2]: https://github.com/poodle64/full-stack-app-template/compare/v2026.7.1...v2026.7.2
[2026.7.1]: https://github.com/poodle64/full-stack-app-template/compare/v2026.7.0...v2026.7.1
[2026.7.0]: https://github.com/poodle64/full-stack-app-template/releases/tag/v2026.7.0
