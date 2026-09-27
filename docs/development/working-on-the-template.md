# Working on this template

Read before editing anything under `template/`. Two disciplines here fail **silently** — no error, no signal, just apps quietly running old code — and the rest of this page is the traps in the shape itself, each of which has cost a real outage or a silent wrong-behaviour and each of which looks fine in review.

## Silent failure 1: an untagged change reaches nothing

`copier` resolves a template by its **latest git tag**, never the tip of `main`. A change pushed without a tag is invisible: apps keep stamping against the previous tag with no error. So a template change is not shipped until it is tagged.

```bash
git tag -a v2026.8.16 -m "Release 2026.8.16"   # CalVer, core/git-workflow.md
git push origin main v2026.8.16
```

Tag once per logical change set, not per commit, and only once something will actually consume it — `git-workflow.md` §Release Cadence: a version is earned by reaching a consumer. The corollary is easy to miss: the fleet mostly converges by taking files directly rather than by `copier update`, so a tag is usually owed to the *next fresh stamp*, not to the apps that already have the change. When in doubt, record the work under `[Unreleased]` and let the next release spend the number.

Tagging by hand is discipline, not a ratchet. If template changes ever start missing their tags, the fix is to stamp the tag in CI, not to try harder.

## Silent failure 2: a stale parity manifest measures against an old factory

Every stamped app carries its own `.template-parity.json`: the sha256 of each factory-owned file as the template renders it for that app's own copier answers, plus the template commit that render came from, so an app that quietly edits its `Dockerfile` fails CI instead of drifting unnoticed. Nothing is normalised; the app's name, ports and palette come back through the render and are identical on both sides.

**Each stamped app carries its own copy of that manifest and measures itself against that copy.** An app whose copy is old therefore measures itself against an *old factory* and reports green while running old code. Every app in the fleet was doing exactly this until 2026-08-19; the tell was that their totals disagreed — 64/64, 41/44, 68/70, three counts for one manifest. What it hid: two apps that had never taken a released SPA fix, an undeclared runtime dependency, and three unmet dependency floors.

Two consequences:

- Changing a gated file in `template/` breaks parity in every app until each takes the new copy **and** a re-stamped manifest. Both halves, or the gate lies.
- You do not maintain the manifest by hand. `check-template-parity.py --generate` (in master's `canonical-app-migration` skill) writes it into the app from a fresh render of the tagged template; an app takes a new factory file and regenerates its manifest in the same commit. A stale manifest is worse than none — it passes every app matching the *old* template.

An app that must genuinely differ records `parity:<path>`, or `deps:<name>` for a dependency floor, in its `.canonical-exceptions`, dated, with a reason. The bar is `canonical-app-shape.md` §Sameness: a difference that is right is right for every app, so it belongs here, not there.

## Traps in the shape

**The `/mcp` mount is order-sensitive.** `raw_mcp_app` carries the FastMCP lifespan — the streamable-HTTP session manager's task group lives there — while the *gated* wrapper is what mounts. Chain the lifespan from the raw app, mount the gated one. Backwards either leaves the session manager unstarted or leaves the surface open. The agent endpoint is `POST /mcp/`, trailing slash required.

**`/mcp` must be mounted `stateless_http=True`.** FastMCP keeps each session's live transport in a per-*process* dict; gunicorn runs a worker pool with no shared store and no sticky routing, so a follow-up request landing on another worker returns JSON-RPC `-32600 "Session not found"` — roughly `(workers-1)/workers` of the time. Load-dependent, so one worker or a warm connection hides it completely. `backend/tests/test_mcp_stateless.py` builds the app twice and drives the follow-up at the second instance — the only thing that would catch a behavioural regression. (`main.py` has been parity-gated since it became a carbon copy, so the gate catches an app that EDITS the line; it cannot catch the factory changing it, which is what this test is for.)

**Behind a proxy, the dev server must inject nothing.** Vite merges a proxy's static `headers` object **last**, so a synthetic identity silently overwrites the real `x-authentik-*` headers nginx supplied — every row then written under the wrong person while everything looks healthy. `frontend/dev-identity.ts` owns that decision and is gated. Only the literal `'true'` counts for `<APP>_DEV_BEHIND_PROXY`: a truthy `'1'` would inject nothing while nothing was in front, and 401 every request.

**The SPA path must resolve from the deployment, not the source tree.** `project_root()` walks up from the package, which inside a container lands in site-packages — nowhere. Harmless for the settings lookup it was written for, because pydantic falls back to the process environment; silently fatal for the SPA, where the mount is skipped, a dev-oriented "run `pnpm build`" warning is logged, and the container still reports healthy because the healthcheck probes `/openapi.json`. Use `frontend_build_dir()`, which tries the deployment layout first.

**Configuration comes from the process environment, and `backend/.env` is what fills it.** No settings section reads a dotenv file itself (#6 removed that wiring); pydantic reads the environment. Three consumers put `backend/.env` there and they are not all shells: `.envrc` exports it for the terminal, the `.vscode` launch configurations name it as their `envFile`, and `compose.yaml` mounts it as `env_file`. That is why the one machine-local file must be dotenv-format at that path rather than a shell file a debugger cannot read — do not add a second location, and do not move this one. Every section must also set `extra="ignore"`: a key belonging to a sibling section is not an error, and forbidding it makes the app refuse to start on the very file the example tells you to copy.

**A secret setting is declared, never hand-validated per section.** `config/vend.py`'s `Vended` field spec and `VendedSettings` base are what every secret-bearing settings section uses (`config/sections/database.py`'s `postgres_password` is the pattern): a field names its broker credential and field, and an empty value vends by attesting this app's own software identity key file in-process, with bounded retries for a broker still starting up. No section hand-writes its own environment/file/broker resolution order, and `backend/.env` never carries a credential — `platform/canonical-app-shape.md` §Development launch is the shape's own statement of this; this note is only where an editor of THIS repo would look for the mechanics.

**A context with no identity sets `<APP>_VEND=off`, never a dummy value per secret.** CI has no software identity key to vend under, so a stamped app whose own domain settings add `Vended` fields would otherwise need one env var per field per workflow just to construct `Settings()` at all. `<APP>_VEND=off` skips the broker for whatever field is still empty after the environment and any boot-lane file, leaving it at its empty default and logging once. `backend/tests/conftest.py` sets it by default for every pytest run (`os.environ.setdefault`, so a developer deliberately exercising a real vend in a test session overrides it) and `.github/image-smoke.sh` sets it on the container the docker-build gate boots — both construct `Settings()` with no identity behind them. An app's own e2e/migration CI job (there is no template-owned one; it calls the household `playwright-container.yaml` reusable directly) must set it the same way, e.g. via that reusable's `job-env` input. Production never sets it: compose supplies every name, so the switch is never reached and an unnamed field still fails closed.

**Under xdist, the suite migrates once and copies.** Each worker has its own database on one shared Postgres, and workers migrating at the same moment share its lock table: 7,808 slots on postgres:17's defaults, against about 3,000 held by one of godswood's migrations until it commits. A handful in step die "out of shared memory", and only under load, so a quiet machine hides it. `backend/tests/conftest.py` migrates in the xdist controller before any worker exists, and each worker copies that database (`CREATE DATABASE … TEMPLATE`). Do not move the migration back into the workers, and do not raise `max_locks_per_transaction` instead: the explicit `<APP>_TEST_POSTGRES_*` server is not the suite's to configure.

**Alembic's URL must not go through `ConfigParser`.** `Config.set_main_option()` raises on any value containing a literal `%`, and the password is percent-encoded into that URL — so the `openssl rand -base64 32` the compose header documents produces a trailing `=` → `%3D` and kills boot before a single migration runs. The URL is a module-level string used directly by both the offline and online paths.

**An E2E spec reads no body it has not checked.** `APIRequestContext` resolves on any answer, so `(await (await ctx.get(path)).json()) as T` hands a 409, a 500 or a 429 body back wearing the success type; the run fails several steps later, at whatever first iterates it, as `TypeError: (intermediate value) is not iterable` — naming neither the endpoint nor the status. Every direct call in a spec goes through `tests/e2e/api.ts` (`ok`, `readJson`), which throws naming the URL, the status and the body. The one status that is not the app's fault gets its own sentence there: a full pass drives more requests a minute than the shipped `rate_limit_default` of 100/minute admits from one address, and both identities in the suite share one. The factory cannot turn that off for a local run — `playwright.config.ts` boots the frontend only, and the backend is whatever the developer started — so `<APP>_RATE_LIMIT_ENABLED=false` belongs in that backend's environment, set the same way an app's own e2e CI job already sets `<APP>_VEND=off`.

**Do not re-declare shadcn token names.** An app picks its palette by overriding `--ds-color-primary` and its pair; the whole surface follows, because `@poodle64/ui/styles.css` maps every shadcn name onto a `--ds-*` token. Declaring `--card`/`--muted`/`--accent`/`--input` yourself makes the variable exist but never registers it as a Tailwind v4 theme colour, so `bg-card` and friends compile to *no rule at all* — no build error, no lint hit, no failing test (`radar-hooves/design-system#3`). Sidebar and chart colours are the one part still owned per app, because the package ships neither component.

## Two surfaces, two gates, never interchangeable

The human surface (`/api`, the SPA) is **Tier 1a**: identity arrives as `x-authentik-*` headers from a forward-auth proxy, and network isolation is the security boundary. The taxonomy lives in `platform/authentication.md` — do not restate it.

The machine surface (`/mcp`) does **not** trust a forwarded header, because a machine caller does not traverse the human proxy and could forge one. It validates a live Authentik bearer app-side, then resolves it against `config/actors.yaml`. Both halves are load-bearing: Authentik serves one instance-wide userinfo endpoint that accepts any valid token from any application, so the bearer check proves identity alone and the allow-list is what restores the app boundary. `mcp/http_auth.py` and `mcp/actors.py` are byte-identical carbon copies — do not edit them per app.

`<APP>_OIDC_USERINFO_URL` defaults to empty and **fails closed**: a fresh stamp's `/mcp` is shut rather than open, and `create_app()` logs a warning naming the variable so the closed state is never a mystery. All four `<APP>_OIDC_*` variables are read at runtime, so re-pointing at a different provider never needs a rebuild.
